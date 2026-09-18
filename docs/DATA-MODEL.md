# Data model

Core banking tables are `rm_users`, `customers`, `accounts`, `transactions`, `cards`, `deposits`
and `customer_interactions`. AI tables are `agent_runs`, `recommendations`,
`recommendation_evidence` and `recommendation_feedback`.

The MSB evaluation framework (migration `MsbCustomerModel`) adds:

| Table | Source | Purpose |
| --- | --- | --- |
| `customers` (+ `cif`, `branch`, `tier`, `declared_behaviour`, `declared_risk_appetite`, `churn_warning`, `behaviour_note`) | sheet *Danh sách KH & Phân hạng* | Declared tier (Aff / MassAff / Mass), behaviour and risk appetite. `id = customer_code = cif`. |
| `customer_daily_positions` | sheet *Nhật ký 365 ngày* | One row per customer per day: 9 balance columns, 15 flow columns, `txn_count`, `is_active`, `day_index`. PK `(customer_id, position_date)`. |
| `product_holdings` | sheet *Product Holding* | 13 product lines (`ACCOUNT, CASA, FD, LOAN_ADVANCE, BOND, CREDIT_CARD, LOAN_OVERDRAFT, LOAN_UNSECURED, LOAN_MORTGAGE, FX, BANCA_LIFE, BANCA_NONLIFE, FUND_CERT`), `held` boolean. |
| `next_best_offers` | sheet *Next Best Offer* | Static rank 1–5 per unheld family (`CREDIT_CARD, BANCA, FX, BOND, LOAN`), `NULL` = already owned. |
| `customer_metrics` | computed | Part B snapshot per `(customer_id, as_of_date)`: see below. |

`accounts`, `transactions`, `cards` and `deposits` are derived from the journal at seed time
(two accounts per customer, one transaction per non-zero daily flow cell, one credit card when
the sheet gives a limit, one deposit when FD was ever held). `deposits.maturity_date` and
`interest_rate` are nullable because the dataset carries neither.

## Part B metrics (`customer_metrics`)

Computed by `apps/api/src/modules/metrics/metrics.formulas.ts`, verified against all 20 rows of
sheet *Chỉ số đánh giá KH* (`metrics.formulas.spec.ts`, relative tolerance 1e-6). Windows use the
journal day index: last 90 days = `day_index > N-90`, previous 90 = `N-180 < day_index <= N-90`.

| Column | Formula |
| --- | --- |
| `recency_days` | `N − max(day_index where is_active)` |
| `freq_90`, `freq_prev_90` | Σ `txn_count` in each window |
| `casa_avg_90`, `casa_avg_prev_90`, `casa_trend` | AVG CASA per window, `(J−K)/K` (0 when K = 0) |
| `casa_cv` | sample STDEV(CASA last 90) / AVG |
| `cc_avg_balance_90`, `cur` | AVG card balance last 90 / `credit_limit` (0 when no card) |
| `loan_total`, `fd_current`, `bond_current`, `fund_cert_current` | last-day values |
| `fd_avg_prev_90`, `fd_liquidated` | AVG FD previous window; `fd_current = 0 AND fd_avg_prev_90 > 0` |
| `tav` | `casa_avg_90 + fd_current + bond_current + fund_cert_current` |
| `leverage` | `loan_total / tav` (kept raw; the sample has 59x for a mortgage customer) |
| `phs`, `holding_count` | held lines / 13 |
| `fx_volume_12m` | Σ FX flow over 365 days |
| `ras_raw`, `ras` | `(bond + fund_cert + fx_volume_12m) / tav` exactly as the sheet; `ras = min(ras_raw, 1)` for classification because FX turnover is a flow and can exceed the asset base many times |
| `value_score` | `tav / MAX(tav over all customers) × 100` — portfolio-relative, always recomputed for everyone |
| `churn_score`, `churn_label` | `40·min(recency/90,1) + 30·min(max(0,−trend),1) + 20·fd_liquidated + 10·(freq_90 < 0.5·freq_prev_90)`; ≥60 Cao, ≥30 Trung bình |
| `cross_sell_score` | `(1 − phs) × 100` |
| `priority_score` | `0.4·value + 0.35·churn + 0.25·cross_sell` |
| `behaviour_label`, `risk_appetite_label`, `tier_label`, `phs_label` | Part C classifications (computed, shown next to the declared values) |
| `suggestion_code` | Nested IF of column *Gợi ý kịch bản*: `LEVERAGE_HIGH → CUR_HIGH → CHURN_HIGH → RISK_MISMATCH → UNDER_PENETRATED → CASA_SURGE_NO_BOND → DORMANT → MAINTAIN` |

`customer_metrics` always stores the canonical definition: the latest journal day with a 90-day
window. Any other as-of date or window length (the UI period filter, the analyse-by-period flow) is
recomputed on the fly and never persisted; responses carry `windowDays` so a caller can tell which
window produced the numbers. Field names keep their `90` suffix and mean "current window".

All relationships use foreign keys. Money uses `numeric(20,2)` serialized as a decimal string;
ratios and scores are `double precision`. A partial unique index allows only one PENDING/RUNNING
analysis per RM/customer pair. Feedback is unique per RM/recommendation and updated in place.
