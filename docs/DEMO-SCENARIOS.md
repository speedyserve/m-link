# Demo scenarios

Dataset as-of date: **2026-09-18** (last row of the 365-day journal). Customer ids are CIFs.

| CIF | Customer | What the data shows | Expected outcome |
| --- | --- | --- | --- |
| `08102466` | Nguyễn Văn S | No transaction for 229 days, FD closed mid-term, churn score 63.7 | `at_risk`; retention first (online deposit +0.5%/year for priority customers); no cross-sell |
| `08100548` | Nguyễn Văn D | Mortgage + overdraft 4.67 bn vs 79 m assets, leverage 59x | Protection insurance (Pru – Bảo vệ tối đa); loan products are blocked |
| `08101096` | Nguyễn Văn H | CASA +16.3% in 90 days, 117 bn FX turnover, no bond | MSB certificates of deposit, Pru unit-linked, FX/SWIFT package |
| `08101918` | Nguyễn Văn O | Two open complaints about debt-collection calls (seeded interactions) | CUSTOMER CARE FIRST / DO NOT SELL, no recommendations |
| `08102740` | Nguyễn Văn U | Largest TAV (6.79 bn), Value Score 100, Priority 53.5, NBO rank 1 = FX | Top of the RB queue |
| `08101507` | Nguyễn Văn L | Core customer, 8/13 products, stable | `healthy`, no recommendation (`MAINTAIN`) |

RB queue (`GET /api/metrics/queue`) is ordered by Priority Score: 08102740 (53.5), 08102466
(42.7), 08100137 (41.5), 08101781 (37.3), 08100959 (33.4), …

Rules that cannot fire on this dataset and are covered by synthetic unit tests only:
`NEW_CIF_ONBOARDING` (youngest CIF is 365 days old), `FD_EVENT` via maturity date (the workbook
has no maturity dates; the rule uses the mid-term liquidation flag instead) and
`BUSINESS_CASHFLOW_VOLATILE` (no occupation data; it needs CV > 0.2 plus a business loan or a
"kinh doanh" note).

The mock Agent (`AGENT_PROVIDER=mock`) returns static content for the first five CIFs above and
echoes stored metrics for the rest. The Python Agent applies the full Part D matrix to any CIF.

## Reading an analysis across periods

Changing the period filter and re-analysing often returns the **same recommendations**: the Part D
rules are threshold-based, so a dormant customer stays `CHURN_HIGH` in every window. What does change
is the numbers behind them (08102466: churn 63.7 over 90 days vs 63.4 over 30 days, CASA trend −12.2%
vs −11.2%) and which period rules fire. If the score and the signal text are *byte-identical* across
windows and the analysis shows "the Agent ignored the selected period", the running Agent predates
the period-aware contract — restart it (it keeps its code in memory; use `--reload` locally).
