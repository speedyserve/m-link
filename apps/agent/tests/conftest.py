"""Shared fixtures: metric payloads that mirror sheet "Chỉ số đánh giá KH" for key CIFs."""

from __future__ import annotations

import pytest

from application_client import CustomerContext
from models import CustomerMetrics

BASE_METRICS = dict(
    customerId="08100411", asOfDate="2026-09-18", recencyDays=0, freq90=104, freqPrev90=91,
    casaAvg90="71007844.44", casaAvgPrev90="71597866.67", casaTrend=-0.0082, casaCv=0.0448,
    ccAvgBalance90="0.00", creditLimit="0.00", cur=0.0, loanTotal="0.00", fdCurrent="0.00", fdAvgPrev90="0.00",
    fdLiquidated=False, bondCurrent="0.00", fundCertCurrent="0.00", tav="71007844.44", leverage=0.0, phs=0.1538,
    holdingCount=2, fxVolume12m="0.00", rasRaw=0.0, ras=0.0, valueScore=1.05, churnScore=0.25, churnLabel="Thấp",
    crossSellScore=84.6, priorityScore=21.66, behaviourLabel="Trung tính", riskAppetiteLabel="An toàn",
    tierLabel="Mass", phsLabel="Chưa khai thác", suggestionCode="MAINTAIN", isNewCif=False,
    computedAt="2026-09-18T00:00:00.000Z",
)

HOLDINGS_BASE = {code: False for code in [
    "ACCOUNT", "CASA", "FD", "LOAN_ADVANCE", "BOND", "CREDIT_CARD", "LOAN_OVERDRAFT",
    "LOAN_UNSECURED", "LOAN_MORTGAGE", "FX", "BANCA_LIFE", "BANCA_NONLIFE", "FUND_CERT",
]}


def make_metrics(**overrides) -> CustomerMetrics:
    return CustomerMetrics(**{**BASE_METRICS, **overrides})


def make_period_summary(
    *,
    from_date: str = "2026-08-20",
    to_date: str = "2026-09-18",
    days: int = 30,
    active_days: int = 25,
    txn_count: int = 80,
    casa_start: float = 30_000_000,
    casa_end: float = 29_000_000,
    card_spend: float = 0,
    card_spend_days: int = 0,
) -> dict:
    """Shape of GET /internal/customers/:id/period-summary, trimmed to what the rules read."""
    return {
        "range": {"from": from_date, "to": to_date, "days": days},
        "activity": {"days": days, "activeDays": active_days, "txnCount": txn_count},
        "balances": {"casaBalance": {"start": casa_start, "end": casa_end, "avg": (casa_start + casa_end) / 2}},
        "flows": {"CC_SPEND": {"total": card_spend, "days": card_spend_days}},
    }


def make_context(metrics: CustomerMetrics, *, holdings: dict[str, bool] | None = None,
                 nbo: dict[str, int | None] | None = None, customer: dict | None = None,
                 interactions: list[dict] | None = None, deposits: list[dict] | None = None,
                 period_summary: dict | None = None) -> CustomerContext:
    return CustomerContext(
        customer={"id": metrics.customerId, "customerCode": metrics.customerId, "fullName": "Khách hàng test",
                  "tier": metrics.tierLabel, "declaredRiskAppetite": "Cân bằng", "behaviourNote": "", **(customer or {})},
        metrics=metrics,
        holdings={**HOLDINGS_BASE, "ACCOUNT": True, "CASA": True, **(holdings or {})},
        next_best_offers=nbo or {"CREDIT_CARD": 1, "BANCA": 2, "FX": 3, "BOND": 4, "LOAN": 5},
        interactions=interactions or [],
        deposits=deposits or [],
        period_summary=period_summary,
    )


@pytest.fixture(autouse=True)
def disable_llm(monkeypatch):
    """Tests never call the remote LLM."""
    import generator

    monkeypatch.setattr(generator.settings, "llm_enabled_for_content", False)


@pytest.fixture
def churn_high_s() -> CustomerContext:
    """08102466 Nguyễn Văn S: 229 idle days, FD liquidated, churn 63.7."""
    return make_context(make_metrics(
        customerId="08102466", recencyDays=229, freq90=0, freqPrev90=0, casaAvg90="195331144.44",
        casaAvgPrev90="222541922.22", casaTrend=-0.1223, casaCv=0.0933, fdLiquidated=True, fdAvgPrev90="1750000000.00",
        tav="195331144.44", phs=0.2308, holdingCount=3, valueScore=2.88, churnScore=63.67, churnLabel="Cao",
        crossSellScore=76.9, priorityScore=42.67, behaviourLabel="Tiêu cực", suggestionCode="CHURN_HIGH",
    ), holdings={"FD": True}, customer={"fullName": "Nguyễn Văn S", "tier": "Mass", "declaredRiskAppetite": "An toàn"})


@pytest.fixture
def leverage_high_d() -> CustomerContext:
    """08100548 Nguyễn Văn D: mortgage + overdraft, leverage 59x, CV 0.11."""
    return make_context(make_metrics(
        customerId="08100548", freq90=214, freqPrev90=190, casaAvg90="79062533.33", casaAvgPrev90="95483300.00",
        casaTrend=-0.172, casaCv=0.1136, loanTotal="4669358000.00", tav="79062533.33", leverage=59.059,
        phs=0.3077, holdingCount=4, valueScore=1.17, churnScore=5.16, crossSellScore=69.2, priorityScore=19.58,
        behaviourLabel="Tiêu cực", tierLabel="Mass", phsLabel="Trung bình", suggestionCode="LEVERAGE_HIGH",
    ), holdings={"LOAN_OVERDRAFT": True, "LOAN_MORTGAGE": True},
       customer={"fullName": "Nguyễn Văn D", "tier": "Aff", "behaviourNote": "Vay nhiều (thế chấp + thấu chi)"})


@pytest.fixture
def casa_surge_h() -> CustomerContext:
    """08101096 Nguyễn Văn H: CASA +16.3%, FX 117 bn, no bond, declared Rủi ro cao."""
    return make_context(make_metrics(
        customerId="08101096", freq90=227, freqPrev90=240, casaAvg90="379661588.89", casaAvgPrev90="326432866.67",
        casaTrend=0.1631, casaCv=0.0526, fdCurrent="1247000000.00", fdAvgPrev90="1247000000.00", tav="1626661588.89",
        phs=0.3077, holdingCount=4, fxVolume12m="117651000000.00", rasRaw=72.33, ras=1.0, valueScore=23.97,
        churnScore=0.0, crossSellScore=69.2, priorityScore=26.9, behaviourLabel="Tích cực",
        riskAppetiteLabel="Rủi ro cao", tierLabel="MassAff", phsLabel="Trung bình", suggestionCode="CASA_SURGE_NO_BOND",
    ), holdings={"FD": True, "FX": True}, customer={"fullName": "Nguyễn Văn H", "tier": "MassAff", "declaredRiskAppetite": "Rủi ro cao"})
