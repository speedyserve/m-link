#!/usr/bin/env bash
#
# Deploy the M-Link API to Railway and the web app to Vercel, then check the
# result end to end.
#
# Platform variables and secrets are out of scope: this script assumes they are
# already set on Railway and Vercel. docs/DEPLOYMENT.md lists what must exist
# and explains the traps that are easy to hit without it.
#
# The Agent is deployed separately on GreenNode AgentBase and is never touched
# here; `verify` only reports which provider the API is wired to.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

step()  { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }
info()  { printf '    %s\n' "$1"; }
ok()    { printf '    %sPASS%s  %s\n' "$GREEN" "$RESET" "$1"; }
bad()   { printf '    %sFAIL%s  %s\n' "$RED" "$RESET" "$1"; }
warn()  { printf '    %sWARN%s  %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '\n%serror:%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

FAILURES=0
check() { # check <description> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — got '$2', expected '$3'"; FAILURES=$((FAILURES + 1)); fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. $2"
}

# ---------------------------------------------------------------- discovery

api_url() {
  if [ -n "${MLINK_API_URL:-}" ]; then printf '%s' "${MLINK_API_URL%/}"; return; fi
  local domain
  domain=$(railway variables 2>/dev/null | sed -n 's/.*RAILWAY_PUBLIC_DOMAIN *│ *\([^ ]*\) *║.*/\1/p' | head -1)
  [ -n "$domain" ] || die "could not discover the API URL. Set MLINK_API_URL, or link the service with 'railway link'."
  printf 'https://%s' "$domain"
}

web_url() {
  if [ -n "${MLINK_WEB_URL:-}" ]; then printf '%s' "${MLINK_WEB_URL%/}"; return; fi
  local name
  name=$(python3 -c "import json;print(json.load(open('.vercel/project.json'))['projectName'])" 2>/dev/null || true)
  [ -n "$name" ] || die "could not discover the web URL. Set MLINK_WEB_URL, or link the project with 'vercel link'."
  printf 'https://%s.vercel.app' "$name"
}

status_of() { curl -s -o /dev/null -m "${2:-20}" -w '%{http_code}' "$1"; }

# ---------------------------------------------------------------- preflight

preflight() {
  step "Preflight"

  need_cmd railway "Install it with: npm i -g @railway/cli"
  need_cmd vercel  "Install it with: npm i -g vercel"
  need_cmd python3 "Install Python 3."

  railway whoami >/dev/null 2>&1 || die "not signed in to Railway. Run: railway login"
  ok "Railway CLI signed in"

  railway status >/dev/null 2>&1 || die "no Railway project linked. Run: railway link"
  ok "Railway project linked"

  vercel whoami >/dev/null 2>&1 || die "not signed in to Vercel. Run: vercel login"
  ok "Vercel CLI signed in"

  # Vercel builds with Root Directory = apps/web, so the upload must start at the
  # repository root; a link inside apps/web would make it look for apps/web/apps/web.
  [ -f .vercel/project.json ] || die "no Vercel project linked at the repository root. Run: vercel link --project <name>"
  ok "Vercel project linked at the repository root"

  # Both deploys upload the working tree, so uncommitted work ships silently.
  if [ -n "$(git status --porcelain)" ]; then
    warn "working tree has uncommitted changes — they WILL be deployed"
  else
    ok "working tree clean"
  fi

  info ""
  info "API: $(api_url)"
  info "web: $(web_url)"
}

# ---------------------------------------------------------------- deploy

deploy_api() {
  step "Deploying the API to Railway"
  info "Uploading the working tree; Railway builds apps/api/Dockerfile."
  info "${DIM}Requires RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile on the service.${RESET}"
  railway up --ci

  local url; url=$(api_url)
  info "Waiting for $url/health/ready"
  local i
  for i in $(seq 1 60); do
    [ "$(status_of "$url/health/ready")" = "200" ] && { ok "API healthy after ~$((i * 5))s"; return; }
    sleep 5
  done
  die "the API did not become healthy within 5 minutes. Check: railway logs"
}

deploy_web() {
  step "Deploying the web app to Vercel"
  info "Uploading from the repository root so pnpm can resolve @mlink/contracts."
  vercel deploy --prod --yes

  local url; url=$(web_url)
  info "Waiting for $url/dashboard"
  local i
  for i in $(seq 1 60); do
    [ "$(status_of "$url/dashboard")" = "200" ] && { ok "web reachable after ~$((i * 5))s"; return; }
    sleep 5
  done
  die "the web app did not become reachable within 5 minutes. Check: vercel ls"
}

# ---------------------------------------------------------------- migrations

migrate() {
  step "Running database migrations"
  # Railway never runs railway.json's preDeployCommand, so migrations are explicit.
  info "Running run-migrations.js inside the deployed container"
  railway ssh "node apps/api/dist/database/run-migrations.js"
  ok "migrations applied"
}

# ---------------------------------------------------------------- verify

verify() {
  local api web body
  api=$(api_url); web=$(web_url)
  step "Verifying $api"

  body=$(curl -s -m 20 "$api/health" || true)
  check "GET /health" "$(printf '%s' "$body" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo unreachable)" "ok"

  body=$(curl -s -m 20 "$api/health/ready" || true)
  check "GET /health/ready (database)" "$(printf '%s' "$body" | python3 -c "import json,sys;print(json.load(sys.stdin).get('database',''))" 2>/dev/null || echo unreachable)" "up"

  # Swagger exposes the whole route catalogue and X-RM-ID is not authentication.
  check "GET /docs is hidden in production" "$(status_of "$api/docs")" "404"

  check "GET /internal without a token" "$(status_of "$api/internal/customers/x/metrics")" "401"

  local total
  total=$(curl -s -m 20 -H 'X-RM-ID: RM001' "$api/api/customers" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo 0)
  if [ "$total" -gt 0 ] 2>/dev/null; then ok "GET /api/customers returned $total customers"
  else bad "GET /api/customers returned no data — has the database been seeded?"; FAILURES=$((FAILURES + 1)); fi

  step "Verifying CORS"
  local allowed denied
  allowed=$(curl -s -D- -o /dev/null -m 20 -X OPTIONS "$api/api/customers" \
    -H "Origin: $web" -H 'Access-Control-Request-Method: GET' | grep -ci 'access-control-allow-origin' || true)
  denied=$(curl -s -D- -o /dev/null -m 20 -X OPTIONS "$api/api/customers" \
    -H 'Origin: https://not-the-app.example' -H 'Access-Control-Request-Method: GET' | grep -ci 'access-control-allow-origin' || true)
  check "the web origin is allowed" "$allowed" "1"
  check "an unknown origin is refused" "$denied" "0"

  step "Verifying the analysis pipeline"
  local cid run provider status err
  cid=$(curl -s -m 20 -H 'X-RM-ID: RM001' "$api/api/customers" \
    | python3 -c "import json,sys;i=json.load(sys.stdin)['items'];print(i[0]['id'] if i else '')" 2>/dev/null || true)
  if [ -z "$cid" ]; then
    warn "no customer to analyse — skipping"
  else
    run=$(curl -s -m 60 -X POST -H 'X-RM-ID: RM001' "$api/api/customers/$cid/analyze" || true)
    provider=$(printf '%s' "$run" | python3 -c "import json,sys;print(json.load(sys.stdin).get('provider',''))" 2>/dev/null || true)
    status=$(printf '%s' "$run" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
    err=$(printf '%s' "$run" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error') or 'none')" 2>/dev/null || true)
    check "POST /api/customers/$cid/analyze" "$status" "COMPLETED"
    info "provider=$provider error=$err"
    [ "$provider" = "mock" ] && warn "the API is wired to the mock Agent, not GreenNode AgentBase"
  fi

  step "Verifying $web"
  check "GET /dashboard" "$(status_of "$web/dashboard")" "200"
  check "GET /customers"  "$(status_of "$web/customers")"  "200"

  printf '\n'
  if [ "$FAILURES" -eq 0 ]; then
    printf '%s==> everything passed%s\n' "$GREEN" "$RESET"
  else
    printf '%s==> %d check(s) failed%s\n' "$RED" "$FAILURES" "$RESET"
    return 1
  fi
}

usage() {
  cat <<'USAGE'
Deploy the M-Link API and web app, then check the result.

Usage: scripts/deploy.sh <command>

Commands:
  preflight   Check the tooling, logins and project links
  api         Deploy the API to Railway from the working tree
  web         Deploy the web app to Vercel from the repository root
  migrate     Run database migrations inside the deployed API container
  verify      Check the deployed system end to end
  all         preflight, api, web, verify

Environment:
  MLINK_API_URL   Override the discovered Railway URL
  MLINK_WEB_URL   Override the discovered Vercel URL

The Agent on GreenNode AgentBase is deployed separately and is never touched.
Platform variables and secrets must already be set. See docs/DEPLOYMENT.md.
USAGE
}

# No default command: a bare invocation must never start deploying.
case "${1:-help}" in
  preflight) preflight ;;
  api)       preflight; deploy_api ;;
  web)       preflight; deploy_web ;;
  migrate)   migrate ;;
  verify)    verify ;;
  all)       preflight; deploy_api; deploy_web; verify ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
