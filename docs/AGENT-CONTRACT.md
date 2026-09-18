# Agent contract

The application calls `POST {AGENT_BASE_URL}/v1/agent/analyze` through `AgentClient`.

```json
{
  "customerId": "08102466",
  "objective": "prepare_rm_brief",
  "requestedBy": "RM001",
  "locale": "vi",
  "periodFrom": "2026-08-20",
  "periodTo": "2026-09-18"
}
```

`periodFrom`/`periodTo` are the window the RM filtered in the UI, already clamped to the customer's
journal by the Application. They are named this way because `from` is a Python keyword. When they
are omitted the Agent analyses the default 90-day snapshot. The response echoes the window as
`period: { from, to, windowDays }`; runs stored before periods existed have no `period`.

The response must contain `runId`, `customerId`, `summary`, arrays for `signals` and
`recommendations`, and `guardrail`. Recommendations may be empty. Unknown fields are discarded by
validation. The application stores the raw safe JSON snapshot but exposes only normalized fields.

Provider failures map to `AGENT_TIMEOUT`, `AGENT_NETWORK_ERROR`, `AGENT_REJECTED`,
`AGENT_UNAVAILABLE`, or `AGENT_INVALID_RESPONSE`. The adapter does not retry POST requests.

## Banking context flow

The Agent validates the backend bearer key, then uses `APPLICATION_INTERNAL_TOKEN` to call the
Application's GET-only `/internal/customers/:id` routes: the customer record, `/metrics` (Part B
snapshot, including `asOfDate` and `windowDays`), `/holdings`, `/next-best-offers`, `/interactions`,
`/deposits` and `/cards`. With a window it requests `/metrics?asOf=<periodTo>&windowDays=<length>`
and additionally `/period-summary?from&to`. The Agent never computes metrics itself and never reads
the wall clock: every date comparison uses `asOfDate` from the metrics payload.

**Window semantics.** The aggregation window follows the filtered period: a 30-day period means
Trend compares 30 days with the preceding 30, and CUR averages the card balance over 30 days. The
framework's calibration constants do not scale — the churn recency term keeps its `/90` denominator
and every threshold (60/30, 0.7, 0.8, 0.2, 0.5, ±5%, ±10%) is unchanged. Metric field names keep
their `90` suffix and mean "current window"; `windowDays` states the real length.

Decisioning is `rules.py` — the Part D matrix as an ordered list of rules. Rules that forbid new
lending (`LEVERAGE_HIGH`, `CUR_HIGH`) suppress loan products from lower-priority rules. At most
three recommendations are returned; each carries `evidence` rows of type `metric` with
`sourceReference = customer_metrics:<cif>:<asOfDate>`. `summary.opportunityScore` is the Priority
Score; `relationshipStatus` is `customer_care_first`, `at_risk` (churn label Cao), `opportunity`
or `healthy`. Products come from `knowledge_base.py` (Part A catalogue, reference rates as of
18/09/2026). The LLM only writes the consultation wording and falls back to templates.

The Customer Care First guardrail (open negative interaction ⇒ `sellAllowed=false`, no
recommendations) is applied before any rule.
