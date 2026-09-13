# M-Link

M-Link is a local-first MVP for relationship managers. It presents a Customer 360 workspace, reads synthetic banking data from the M-Link API, and stores a traceable analysis history for each customer.

The repository is a pnpm monorepo. It is ready for local development, an API Docker deployment (including Railway-style environment variables), and a Vercel-style Next.js web deployment.

## What is in the repository

| Location | Responsibility |
| --- | --- |
| `apps/web` | Next.js Customer 360 UI at port `3000` |
| `apps/api` | NestJS API, PostgreSQL migrations, seed data, Swagger at port `4000` |
| `apps/agent` | Python FastAPI analysis service at port `8081` |
| `packages/contracts` | Shared Zod request/response schemas |
| `packages/ui` | Shared UI package placeholder |
| `docs` | Architecture, API, Agent contract, data model, and demo scenarios |

## How an analysis works

```text
Browser
  -> M-Link API
  -> Agent /v1/agent/analyze
  -> API /internal/* (read-only banking context)
  -> Agent rule engine and optional LLM content generation
  -> API persists AgentRun, recommendations, and evidence in PostgreSQL
  -> Browser displays the stored analysis
```

The browser only knows `NEXT_PUBLIC_API_BASE_URL`. It never receives an internal token, Agent API key, or LLM key.

### Decisioning versus LLM content

The Agent intentionally uses a hybrid model:

- Rule code and banking evidence determine signals, scores, guardrails, and product recommendations. For example, a fixed deposit maturing within seven days can trigger an FD recommendation.
- The optional OpenAI-compatible LLM configuration generates the consultation wording only: opening, talking points, objection handling, closing, SMS, and Zalo copy.
- If the LLM is disabled, missing credentials, slow, or invalid, the Agent returns a safe, deterministic fallback script. It does not invent recommendations.

The demo product wording, rates, and eligibility conditions are static seed/demo content. They must be replaced by a business-approved product catalogue and current policies before any production use.

## Prerequisites

- Node.js 22+
- pnpm 11+ (`corepack enable` is recommended)
- Docker Desktop or OrbStack for PostgreSQL
- Python 3.11+ for `apps/agent`

## Start locally

### 1. Create local environment files

Environment files are intentionally ignored by Git. Copy the templates after cloning:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/agent/.env.example apps/agent/.env
```

For the fastest UI/API demo, leave `AGENT_PROVIDER=mock` in `apps/api/.env`.

### 2. Start PostgreSQL and seed the demo data

```bash
docker compose up -d postgres
pnpm install
pnpm migration:run
pnpm db:seed
```

`db:reset` and `demo:reset` are local-only helpers and are refused in production.

### 3. Start web and API

```bash
pnpm dev
```

Open these URLs:

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Swagger: http://localhost:4000/docs

## Run the local Agent end to end

Configure `apps/api/.env` to use the local Agent:

```dotenv
AGENT_PROVIDER=greennode
AGENT_BASE_URL=http://localhost:8081
AGENT_API_KEY=<random-local-agent-key>
INTERNAL_AGENT_TOKEN=<random-local-internal-token>
```

Then configure `apps/agent/.env` with matching server-only values:

```dotenv
APPLICATION_API_BASE_URL=http://localhost:4000
APPLICATION_INTERNAL_TOKEN=<random-local-internal-token>
INBOUND_AGENT_API_KEY=<random-local-agent-key>
```

The two matching pairs are deliberate:

```text
API AGENT_API_KEY               = Agent INBOUND_AGENT_API_KEY
API INTERNAL_AGENT_TOKEN        = Agent APPLICATION_INTERNAL_TOKEN
```

Create the Python environment and start the Agent:

```bash
cd apps/agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8081
```

Restart `pnpm dev` after changing `apps/api/.env`. The Agent must also be restarted after changing `apps/agent/.env`.

### Optional: enable GreenNode LLM content generation

`apps/agent/.env` supports an OpenAI-compatible provider:

```dotenv
LLM_ENABLED_FOR_CONTENT=true
LLM_API_KEY=<set-in-secret-manager>
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-model-id
LLM_REQUEST_TIMEOUT_SECONDS=6
```

This transmits the Agent's content-generation context to that provider. The Agent caps each LLM attempt at six seconds, disables SDK retries, and falls back after two unsuccessful attempts so a slow provider does not cause the API's 30-second deadline to return `504`. A successful remote call writes this Agent log:

```text
consultation_content source=remote model=... format=json
```

Fallback is visible as `consultation_content source=fallback ...`.

### Try an analysis

Use the UI: choose **RM001**, open a customer, then select **Phân tích với M-Link**.

Or call the public API directly:

```bash
curl -X POST http://localhost:4000/api/customers/CUS001/analyze \
  -H 'Content-Type: application/json' \
  -H 'X-RM-ID: RM001' \
  --data '{"locale":"vi"}'
```

The public API requires `X-RM-ID` as a demo portfolio-scoping mechanism. It is not production authentication.

Stable demo customers:

| Customer | Expected scenario |
| --- | --- |
| `CUS001` | Sales opportunity: fixed deposit maturity and idle cash |
| `CUS002` | Customer Care First / Do Not Sell |
| `CUS003` | No Action |
| `CUS013` | No Action: no rule threshold is met |

## Develop further

- Add or adjust a detectable banking condition in `apps/agent/signal_extractor.py`.
- Keep score calculation explainable in `apps/agent/scorer.py`.
- Add a product only with an approved policy source; move product catalogue data out of static Python code before production.
- Extend `packages/contracts` first when changing any API or Agent response, then update both `apps/api` and `apps/web`.
- Add an Agent test for each new signal, guardrail, provider failure, or response shape.
- Preserve the invariant that `DO NOT SELL` returns zero product CTAs.

Useful reference documents:

- [Architecture](docs/ARCHITECTURE.md)
- [API specification](docs/API.md)
- [Agent contract](docs/AGENT-CONTRACT.md)
- [Data model](docs/DATA-MODEL.md)
- [Demo scenarios](docs/DEMO-SCENARIOS.md)

## Checks

Run these before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd apps/agent
source .venv/bin/activate
pytest -q
```

Build the Agent image locally when changing its runtime dependencies:

```bash
docker build -f apps/agent/Dockerfile -t mlink-agent:local apps/agent
```

## Security and push checklist

Never commit `.env`, `.env.local`, `.env.production`, API keys, database URLs containing real passwords, or service tokens. `.gitignore` ignores `.env*` while explicitly retaining `.env.example` templates.

Before staging or pushing:

```bash
git check-ignore -v apps/api/.env apps/web/.env.local apps/agent/.env
git status --short
git add -n .
git diff --cached --check
```

The first command should show an ignore rule for every local environment file. Review the dry-run output from `git add -n .`; it must not list a local environment file or a virtual environment. Use a secrets scanner in CI (for example, Gitleaks) once this repository has a remote.

## Deployment notes

The API Dockerfile accepts Railway-style `PORT` and `DATABASE_URL`. Run migrations as the platform pre-deploy command; never use TypeORM schema synchronization or auto-seed production. Set `CORS_ORIGINS` to the deployed web origin. Deploy the web with `NEXT_PUBLIC_API_BASE_URL` set to the public API URL.

Agent and API must be deployed on a private network or otherwise protect the Agent endpoint with the matching API key. Keep `INTERNAL_AGENT_TOKEN`, `AGENT_API_KEY`, and `LLM_API_KEY` in the platform secret manager, not source control.
