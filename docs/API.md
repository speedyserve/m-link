# API

Public routes require `X-RM-ID`: `GET /api/rms`, `GET /api/dashboard`, customer list/detail and
nested account/transaction/card/deposit/interaction routes, analysis history/detail, analyze,
and recommendation feedback. Lists return `{items,page,limit,total,totalPages}`. Money is a
decimal string and timestamps are ISO 8601.

Internal equivalents live below `/internal/customers/:id` and require
`Authorization: Bearer INTERNAL_AGENT_TOKEN`. They are GET-only. Errors use
`{code,message,details?}` and never include provider stacks or secrets. Swagger at `/docs` is the
executable route reference.

