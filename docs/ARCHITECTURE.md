# Architecture

The pnpm monorepo contains a Next.js web client, a NestJS API, and shared Zod contracts. The API
owns PostgreSQL and is the only browser-facing path to the external Agent. The Agent may call
the API's token-protected, read-only `/internal` routes to gather banking context.

```text
Browser -> Next.js -> NestJS -> AgentClient -> Mock or GreenNode Agent
                         ^                        |
                         +-- read-only internal -+
```

Public demo requests carry `X-RM-ID`. This scopes data but is not production authentication.
Agent outcomes are validated, persisted as immutable runs, and normalized into recommendations
and evidence. Dashboard prioritization consumes stored outcomes only; it contains no AI rules.

