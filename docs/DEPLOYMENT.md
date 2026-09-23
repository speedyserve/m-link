# Deployment

Three pieces, three platforms:

| Piece | Platform | Deployed by |
| --- | --- | --- |
| `apps/api` + Postgres | Railway | `scripts/deploy.sh api` |
| `apps/web` | Vercel | `scripts/deploy.sh web` |
| `apps/agent` | GreenNode AgentBase | separately — see the end of this file |

`scripts/deploy.sh` covers the API and the web app only. It never creates accounts, never
sets platform variables and never touches secrets: do the one-time setup below first, once
per environment, then the script is all you need.

## Prerequisites

```bash
npm i -g @railway/cli vercel
railway login && railway link      # pick the project, environment and API service
vercel login  && vercel link --project <name>   # run this at the REPOSITORY ROOT
./scripts/deploy.sh preflight
```

`preflight` fails loudly if any of that is missing, so start there.

## One-time setup

### Railway (API + database)

1. Create the project and add the **Postgres** plugin.
2. Add a service from the GitHub repository, leaving the root at the repository root.
3. Set these service variables. Leave `PORT` unset — Railway injects it and
   `apps/api/src/main.ts` already reads it.

   | Variable | Value |
   | --- | --- |
   | `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `DATABASE_SSL` | `false` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGINS` | the Vercel production origin, comma-separated for several |
   | `INTERNAL_AGENT_TOKEN` | `openssl rand -hex 32` |
   | `AGENT_PROVIDER` | `mock`, or `greennode` once the Agent is deployed |
   | `AGENT_BASE_URL` | the AgentBase endpoint; any value while the provider is `mock` |
   | `AGENT_API_KEY` | the Agent's `INBOUND_AGENT_API_KEY` |
   | `AGENT_TIMEOUT_MS` | `30000` |

4. Generate a public domain under **Settings → Networking**.
5. Apply the schema and load the demo dataset:

   ```bash
   ./scripts/deploy.sh migrate
   railway ssh "node apps/api/dist/database/seed.js"
   ```

   Seeding truncates every table, so run it once. Never put it in a deploy pipeline.

### Vercel (web)

1. `vercel link` at the repository root, then set **Settings → Build & Deployment → Root
   Directory** to `apps/web`. The CLI cannot set this; without it Vercel builds the
   monorepo root instead of the app.
2. Add `NEXT_PUBLIC_API_BASE_URL` = the Railway domain, for Production and Preview.
3. Set `CORS_ORIGINS` on Railway to the Vercel production origin.

## Deploying

```bash
./scripts/deploy.sh api      # API to Railway, waits for /health/ready
./scripts/deploy.sh web      # web to Vercel, waits for /dashboard
./scripts/deploy.sh verify   # checks across both
./scripts/deploy.sh all      # all of the above
```

Both deploys upload the **working tree**, not the last commit, so uncommitted work ships.
`preflight` warns when the tree is dirty.

`verify` is worth running on its own after any variable change. It catches the failures
that are invisible from a dashboard: CORS that no longer matches, a database that was
never seeded, an API still wired to the mock Agent.

## Traps

Each of these cost real debugging time.

**Railway ignores `railway.json`.** Config as code is deprecated and the Railpack builder
skips the file: it auto-detects the pnpm workspace, finds no start command and fails with
`railpack prepare exited with an error`. `RAILWAY_DOCKERFILE_PATH` is what actually selects
the Dockerfile. `railway config migrate` does not fix this — it emits `dockerfilePath` as a
comment and renames the service after `package.json`, which creates a second service.

**`preDeployCommand` never runs.** Migrations are a manual step after any schema change:
`./scripts/deploy.sh migrate`.

**Vercel needs `vercel-build`.** Without it Vercel runs `next build` alone, and a restored
build cache can supply a stale `packages/contracts/dist`. The symptom is a type error about
a property that does exist in the schema — for example `Property 'actionGroup' does not
exist` — while `pnpm typecheck` passes locally.

**`NEXT_PUBLIC_API_BASE_URL` is inlined at build time.** Every page is a client component,
so changing the variable requires a rebuild, not a redeploy.

**Vercel previews are blocked by CORS.** Each preview gets a fresh hostname that is not in
`CORS_ORIGINS`. Either accept that only production works, or add the origins.

**Deploying from `apps/web` breaks the build.** With Root Directory set to `apps/web`,
Vercel looks for `apps/web/apps/web`. `--prebuilt` fails too: the serverless trace reaches
`node_modules/.pnpm` at the repository root, which an upload from `apps/web` cannot carry.
Always deploy from the repository root.

**Switching `AGENT_PROVIDER` to `greennode` needs both `AGENT_BASE_URL` and
`AGENT_API_KEY`.** `GreenNodeAgentClient` throws `AGENT_CONFIGURATION_ERROR` on every
request when either is missing, so set them before flipping the provider.

**`.dockerignore` must exclude `*.tsbuildinfo`.** It already excludes `dist`, so a stray
build-info file in the context makes `tsc` believe everything is emitted and the API image
ships without `main.js`.

## Rollback

```bash
railway variables --set "AGENT_PROVIDER=mock"   # fall back to the built-in mock Agent
vercel rollback                                  # previous web deployment
```

## The Agent

`apps/agent` runs on GreenNode AgentBase and is deployed with the
[`vngcloud/greennode-agentbase-skills`](https://github.com/vngcloud/greennode-agentbase-skills)
plugin, not by `scripts/deploy.sh`.

The runtime contract is strict: the container must listen on **8080** and answer
`GET /health` with 200, and the image must be built `--platform linux/amd64`. AgentBase
injects `GREENNODE_CLIENT_ID`, `GREENNODE_CLIENT_SECRET`, `GREENNODE_AGENT_IDENTITY` and
`GREENNODE_ENDPOINT_URL`; never repeat those in the runtime env file.

Two pairs of values must match across the two systems:

```text
API AGENT_API_KEY        = Agent INBOUND_AGENT_API_KEY
API INTERNAL_AGENT_TOKEN = Agent APPLICATION_INTERNAL_TOKEN
```

The Agent also needs `APPLICATION_API_BASE_URL` pointing at the Railway domain. `config.py`
reads the environment when the module is imported, so **the runtime must restart** before a
changed variable takes effect — updating it alone leaves the old value in memory.
