# M-Link engineering rules

Read `README.md` and the relevant files in `docs/` before changing a milestone. Keep the
banking application and external AI Agent separate: the application may store banking data,
call an `AgentClient`, validate and persist results, but must never infer sales recommendations.

Use contract-first, mock-first development. All external Agent responses must pass the shared
Zod schema. Use TypeORM migrations only (`synchronize` must remain false). Internal Agent APIs
are read-only and protected by a separate bearer token. Never expose credentials, authorization
headers, provider stack traces, or chain-of-thought.

Keep changes small and within the active milestone. Do not add infrastructure such as Redis,
Kafka, Elasticsearch, Kubernetes, or microservices without an explicit requirement. Before
handoff run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

