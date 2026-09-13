# Data model

Core tables are `rm_users`, `customers`, `accounts`, `transactions`, `cards`, `deposits`, and
`customer_interactions`. AI tables are `agent_runs`, `recommendations`,
`recommendation_evidence`, and `recommendation_feedback`.

All relationships use foreign keys. Customer codes, account numbers, transaction codes, and
external Agent run IDs are unique. Money uses `numeric(20,2)` and is serialized as a decimal
string. Dates are stored as PostgreSQL dates; instants are UTC timestamps. Agent request and
response snapshots use JSONB and are never returned raw to the browser. A partial unique index
allows only one PENDING/RUNNING analysis for an RM/customer pair. Feedback is unique per
RM/recommendation and is updated in place.

