# Agent contract

The application calls `POST {AGENT_BASE_URL}/v1/agent/analyze` through `AgentClient`.

```json
{
  "customerId": "CUS001",
  "objective": "prepare_rm_brief",
  "requestedBy": "RM001",
  "locale": "vi"
}
```

The response must contain `runId`, `customerId`, `summary`, arrays for `signals` and
`recommendations`, and `guardrail`. Recommendations may be empty. `locale` is optional and
defaults to `vi`. Unknown fields are discarded by validation. The application stores the raw
safe JSON snapshot but exposes only normalized fields.

Provider failures map to `AGENT_TIMEOUT`, `AGENT_NETWORK_ERROR`, `AGENT_REJECTED`,
`AGENT_UNAVAILABLE`, or `AGENT_INVALID_RESPONSE`. The initial GreenNode adapter does not retry
POST requests because an idempotency guarantee is not yet available.

## Banking context flow

The Agent's `/v1/agent/analyze` endpoint validates the backend bearer key, then uses
`APPLICATION_INTERNAL_TOKEN` to call the Application's authenticated, GET-only
`/internal/customers/:id` routes. It transforms the banking snapshot into the Agent engine input
and returns this contract. The Agent, not the Application, applies the Customer Care First
guardrail from open negative interactions. The legacy `/analyze` and `/invocations` endpoints
remain available for AgentBase.
