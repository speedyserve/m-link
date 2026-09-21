# API

Public routes require `X-RM-ID`: `GET /api/rms`, `GET /api/dashboard`, customer list/detail
(filters `search`, `tier`, `segment`, `status`) and nested `accounts`, `transactions`, `cards`,
`deposits`, `interactions` (`from`, `to`, `type`, `category`, `page`, `limit` on transactions),
`metrics` (`?asOf=YYYY-MM-DD&windowDays=30` recomputes Part B on the fly for that journal day and
window length, and adds `stored`, `historyDays`, `insufficientHistory`, `windowDays`,
`prevWindowDays`; only the latest day with a 90-day window is served from the stored snapshot), `holdings`, `next-best-offers`, `data-range`
(first/last journal day), `positions?from&to` (or `days`), `period-summary?from&to` (opening /
closing / average / min / max per product balance, total assets, flows per transaction category,
activity, monthly averages), `monthly-averages?from&to`; `GET /api/metrics/queue` (RB queue by
Priority Score); analysis
history/detail, analyze, and recommendation feedback. Lists return
`{items,page,limit,total,totalPages}`. Money is a decimal string and timestamps are ISO 8601.

`POST /api/customers/:id/analyze` takes `{ locale, periodFrom?, periodTo? }`. The period is the
window to analyse; it is clamped to the customer's journal, stored with the run and echoed back as
`period` on the analysis and on every history entry. Only one analysis per RM and customer may be
in flight, regardless of period: a second concurrent request returns 409 `ANALYSIS_IN_PROGRESS`.

Internal equivalents live below `/internal/customers/:id` (including `/metrics?asOf&windowDays`,
`/holdings`, `/next-best-offers`, `/positions?from&to`, `/period-summary?from&to`) and require `Authorization: Bearer INTERNAL_AGENT_TOKEN`. They
are GET-only. Errors use `{code,message,details?}` and never include provider stacks or secrets.
Swagger at `/docs` is the executable route reference.
