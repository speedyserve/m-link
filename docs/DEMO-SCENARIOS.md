# Demo scenarios

Dataset as-of date: **2026-09-18** (last row of the 365-day journal). Customer ids are CIFs. The dataset has 40
customers; the last 20 (CIF `08102877` to `08105480`) each follow a scenario written to change over time, described
in the workbook column *Mô tả hành vi / kịch bản*.

Expected outcome for the default view (last 90 days as of 2026-09-18):

| CIF | Customer | What the data shows | Expected outcome |
| --- | --- | --- | --- |
| `08100274` | Trần Bảo Ngọc | No transaction for 94 days, empty CASA, term deposit closed mid-term, churn score 100 | `at_risk`; retention first (online deposit +0.5%/year for priority customers), then the FD event and reactivation |
| `08100548` | Phạm Đức Duy | Loans of 5.8 bn against 59 m of assets, leverage 99x | Protection insurance (Pru – Bảo vệ tối đa); loan products are blocked |
| `08100959` | Đặng Ngọc Hân | CASA +28.4% in 90 days, no bond, 2.2 bn term deposit | MSB certificates of deposit |
| `08101918` | Trịnh Hoàng Phúc | Two open complaints about debt-collection calls (seeded interactions), leverage 40x | CUSTOMER CARE FIRST / DO NOT SELL, no recommendations |
| `08102740` | Hồ Bảo Uyên | Largest TAV (5.81 bn), Value Score 100, Priority 53.9 | Top of the RB queue; no rule fires (`MAINTAIN`) |
| `08102466` | Mai Thu Sương | Dormant since 2026-02-10, term deposit closed 2026-03-20 | Depends on the period, see below |
| `08103288` | Trần Gia Hưng | New CIF, opened 2026-08-05 (44 days before the as-of date) | `NEW_CIF_ONBOARDING` only for a 30-day period, see below |

The portfolio-wide RB queue (`GET /api/metrics/queue` shows the customers of one RM) is ordered by Priority Score:
08102740 (53.9), 08100274 (52.3), 08104110 (47.2), 08100137 (42.5), 08102603 (39.2), 08102466 (36.7), …

## Rules on this dataset

Scanning every customer with as-of dates every 5 days and windows of 30, 60, 90 and 180 days (220 combinations), these
rules fire somewhere: `LEVERAGE_HIGH`, `CHURN_HIGH`, `FD_EVENT` (the mid-term liquidation branch), `CASA_SURGE_NO_BOND`,
`NEW_CIF_ONBOARDING`, `BUSINESS_CASHFLOW_VOLATILE` (for example `08103151` around 2026-01-01 with a 30-day window),
`FX_ACTIVE`, `DORMANT` and the three period rules.

Rules that never fire on this dataset and are covered by synthetic unit tests only:

- `CUR_HIGH`: no customer's average card utilisation exceeds 80% in any scanned window.
- `RISK_MISMATCH`: no customer declared *An toàn* has (bond + fund + 12-month FX volume) / TAV above 50%.
- `UNDER_PENETRATED`: no customer combines a product holding under 20% with a Value Score above 50.
- `FD_EVENT` through a maturity date: the workbook has no maturity dates, only the liquidation branch is reachable.

The mock Agent (`AGENT_PROVIDER=mock`) returns static content for `08100274`, `08100548`, `08100959`, `08101918` and
`08102740` and echoes stored metrics for the rest. The Python Agent applies the full Part D matrix to any CIF.

## Reading an analysis across periods

Changing the period filter recomputes the metrics for that window, so the analysis often changes. `08102466`:

| Period | Recency | Churn score | Rules that fire |
| --- | --- | --- | --- |
| 90 days ending 2026-02-15 | 5 | 10.4 | `CASA_DROP_IN_PERIOD` |
| 90 days ending 2026-06-20 | 130 | 77.7 (Cao) | `CHURN_HIGH` (retention first), `FD_EVENT`, `DORMANT`, `INACTIVE_IN_PERIOD` |
| last 90 days (default) | 220 | 47.7 | `DORMANT`, `INACTIVE_IN_PERIOD`, `CASA_DROP_IN_PERIOD` |
| last 30 days | 220 | 44.6 | `DORMANT`, `INACTIVE_IN_PERIOD`, `CASA_DROP_IN_PERIOD` |

`NEW_CIF_ONBOARDING` needs a CASA trend above 5%, and a trend needs data in the previous window. `08103288` opened only
44 days ago, so the 45-day and 90-day windows have an empty previous window (trend 0) and no rule fires; the 30-day
window has data in both halves and fires `CASA_SURGE_NO_BOND` and `NEW_CIF_ONBOARDING`.

If the score and the signal text are *byte-identical* across windows and the analysis shows "the Agent ignored the
selected period", the running Agent predates the period-aware contract — restart it (it keeps its code in memory; use
`--reload` locally).
