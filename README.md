# M-Link

M-Link is a local-first MVP for relationship managers. It presents a Customer 360 workspace, reads a synthetic MSB retail portfolio (40 customers x 365 daily positions) from the M-Link API, computes the MSB customer-evaluation metrics, and stores a traceable analysis history for each customer.

The repository is a pnpm monorepo. It is ready for local development, an API Docker deployment (including Railway-style environment variables), and a Vercel-style Next.js web deployment.

## What is in the repository

| Location | Responsibility |
| --- | --- |
| `apps/web` | Next.js Customer 360 UI at port `3000` |
| `apps/api` | NestJS API, PostgreSQL migrations, seed data, Swagger at port `4000` |
| `apps/agent` | Python FastAPI analysis service at port `8080` |
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

- The API computes the Part B metrics of the MSB framework (Recency, Frequency, CASA trend, CV, CUR, Leverage, PHS, RAS, TAV, Churn Score, Priority Score) from the daily journal and stores them in `customer_metrics`. The Agent applies the Part D decision matrix (`apps/agent/rules.py`) to those metrics and picks products from the Part A catalogue (`apps/agent/knowledge_base.py`). For example, churn score >= 60 triggers a retention scenario and leverage > 70% blocks every loan offer.
- The optional OpenAI-compatible LLM configuration generates the consultation wording only: opening, talking points, objection handling, closing, SMS, and Zalo copy.
- If the LLM is disabled, missing credentials, slow, or invalid, the Agent returns a safe, deterministic fallback script. It does not invent recommendations.

Product wording, rates and eligibility come from `Khung_cong_thuc_danh_gia_KH_MSB.docx` (msb.com.vn reference as of 18/09/2026). They are demo content and must be replaced by a business-approved catalogue and current rate sheets before any production use.

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

The seed always truncates and reloads the dataset; `db:reset` and `demo:reset` are aliases, refused in production.

### The MSB sample dataset

`apps/api/src/database/msb-dataset/` holds the committed export of `Data_mau_365ngay_40KH.xlsx`: 40 customers, the 13-line product-holding matrix, Next Best Offer ranks, credit limits, the 14,600-row daily journal and the golden metric values of sheet *Chỉ số đánh giá KH*. The last 20 customers (CIF `08102877` onwards) each follow a scenario written to change over time (recovery, sudden decline, seasonal business, new CIF, bond maturity, …); the scenario of every customer is in the column *Mô tả hành vi / kịch bản* of sheet *Danh sách KH & Phân hạng*. The as-of date is 2026-09-18 (last journal day). Regenerate it from a new workbook with the standard-library script, which reads as many customers as the sheets contain:

```bash
python3 apps/agent/tools/export_msb_dataset.py "~/Downloads/Data_mau_365ngay_40KH.xlsx"
```

`apps/api/src/modules/metrics/metrics.formulas.spec.ts` asserts that the TypeScript formulas reproduce every golden row within a relative tolerance of 1e-6. The securities column of the journal holds deposits into the securities account only (never negative).

### 3. Start web and API

```bash
pnpm dev
```

Open these URLs:

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Swagger: http://localhost:4000/docs (development only; disabled when `NODE_ENV=production`)

## Run the local Agent end to end

Configure `apps/api/.env` to use the local Agent:

```dotenv
AGENT_PROVIDER=greennode
AGENT_BASE_URL=http://localhost:8080
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
pip install -r requirements-dev.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Restart `pnpm dev` after changing `apps/api/.env`. The Agent must also be restarted after changing `apps/agent/.env`.

> **Use `--reload` locally.** Uvicorn keeps the Agent's code in memory, so an Agent started before a
> change keeps answering with the old logic — for example ignoring the analysed period and replying
> with the default 90-day snapshot for every window. The API detects that case: the analysis then
> reports `periodApplied: false` and the UI shows "the Agent ignored the selected period". Also make
> sure only one Agent process is listening on the port (`lsof -nP -iTCP:8080 -sTCP:LISTEN`); a second
> one bound to a different interface can shadow the one you just started.

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
curl -X POST http://localhost:4000/api/customers/08102466/analyze \
  -H 'Content-Type: application/json' \
  -H 'X-RM-ID: RM001' \
  --data '{"locale":"vi","periodFrom":"2026-08-20","periodTo":"2026-09-18"}'
```

`periodFrom`/`periodTo` are optional and default to the last 90 days of the customer's journal. The
analysis follows that window: metrics are recomputed for it, three period rules can fire from it,
and the window is echoed back on the analysis and its history entries.

The public API requires `X-RM-ID` as a demo portfolio-scoping mechanism. It is not production authentication.

Stable demo customers, with the scenario expected for the default view (last 90 days, as of 2026-09-18):

| CIF | Expected scenario |
| --- | --- |
| `08100274` | At risk: 94 idle days, empty CASA, term deposit closed, churn score 100, retention first |
| `08100548` | Leverage 99x: loan-protection insurance, no loan offers |
| `08100959` | CASA +28.4% without bonds: MSB certificates of deposit |
| `08101918` | Customer Care First / Do Not Sell (open complaint) |
| `08102740` | Highest value (TAV 5.81 bn, Priority 53.9), top of the RB queue, no rule fires |
| `08102466` | Period-dependent: dormant since 2026-02-10, churn 47.7 over the last 90 days but 77.7 (retention) for the 90 days ending 2026-06-20 |
| `08103288` | New CIF (opened 2026-08-05): `NEW_CIF_ONBOARDING` only fires for a 30-day period |

Customers are split across RMs by branch: **RM001** (HCM branches and Cần Thơ, 16 customers), **RM002** (Hanoi branches, Hải Phòng and Sở Giao Dịch, 20 customers), **RM003** (Đà Nẵng, 4 customers). The RB queue at `GET /api/metrics/queue` and the dashboard are ordered by Priority Score. See [Demo scenarios](docs/DEMO-SCENARIOS.md).

## Develop further

- Change a metric formula in `apps/api/src/modules/metrics/metrics.formulas.ts` and keep the golden test green (or update the golden export together with the business owner).
- Add or adjust a consultation rule in `apps/agent/rules.py`; every rule has a unit test in `apps/agent/tests/test_rules.py`.
- Add a product only with an approved policy source in `apps/agent/knowledge_base.py`; move the catalogue out of static Python code before production.
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

### Railway (API) and Vercel (web)

Railway builds `apps/api/Dockerfile` from the repository root; `railway.json` pins the pre-deploy
migration, the `/health/ready` probe, and the start command. Railway injects `PORT`, so leave it
unset and point `DATABASE_URL` at the Postgres plugin. Keep `AGENT_PROVIDER=mock` until the Agent is
deployed — `AGENT_BASE_URL` is read only by `GreenNodeAgentClient`, so a placeholder value is inert
while the mock client is selected.

The production image carries `dist/database/seed.js` together with the `msb-dataset` JSON, so the
demo dataset loads through a one-off platform command instead of exposing the database publicly:

```bash
node apps/api/dist/database/seed.js
```

Seeding truncates every table, so run it once after the first deploy and never from the deploy
pipeline.

Vercel uses `apps/web` as its root directory and runs the `vercel-build` script, which compiles
`@mlink/contracts` before `next build`. `NEXT_PUBLIC_API_BASE_URL` is inlined at build time, so
changing it requires a rebuild rather than a redeploy. Vercel preview deployments get a fresh
hostname each time and are blocked by CORS unless that origin is added to `CORS_ORIGINS`.
