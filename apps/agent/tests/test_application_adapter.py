from conftest import make_context, make_metrics, make_period_summary

from application_adapter import to_mlink_response
from models import MLinkAnalyzeRequest


def _request(customer_id: str, period: tuple[str, str] | None = None) -> MLinkAnalyzeRequest:
    return MLinkAnalyzeRequest(
        customerId=customer_id, objective="prepare_rm_brief", requestedBy="RM001", locale="vi",
        periodFrom=period[0] if period else None, periodTo=period[1] if period else None,
    )


def test_churn_high_customer_is_at_risk_with_retention_first(churn_high_s):
    response = to_mlink_response(_request("08102466"), churn_high_s)
    assert response.summary.relationshipStatus == "at_risk"
    assert response.summary.opportunityScore == 42.7
    assert response.guardrail.sellAllowed is True
    assert response.recommendations[0].type == "retention"
    assert response.recommendations[0].product.id == "DEP_ONLINE"
    assert len(response.recommendations) <= 3
    assert any(evidence.description.startswith("Số ngày không giao dịch gần nhất: 229") for evidence in response.recommendations[0].evidence)
    assert all(evidence.sourceReference == "customer_metrics:08102466:2026-09-18" for evidence in response.recommendations[0].evidence)
    assert response.signals[0].type == "churn_high"


def test_leverage_high_customer_gets_protection_and_no_loan_products(leverage_high_d):
    response = to_mlink_response(_request("08100548"), leverage_high_d)
    assert response.recommendations[0].product.id == "BANCA_PRU_PROTECT"
    assert all("LOAN" not in (rec.product.id if rec.product else "") for rec in response.recommendations)
    assert {signal.type for signal in response.signals} >= {"leverage_high", "casa_decline"}
    assert response.summary.relationshipStatus == "opportunity"


def test_casa_surge_customer_gets_cd_msb(casa_surge_h):
    response = to_mlink_response(_request("08101096"), casa_surge_h)
    ids = [rec.product.id for rec in response.recommendations if rec.product]
    assert ids[0] == "CD_MSB"
    assert "FX_SWIFT_PACKAGE" in ids
    assert response.summary.opportunityScore == 26.9
    assert response.recommendations[0].script  # deterministic fallback wording is always present


def test_open_complaint_enforces_customer_care_first(churn_high_s):
    churn_high_s.interactions = [{"id": "INT-1", "status": "OPEN", "sentiment": "NEGATIVE", "summary": "Complaint is unresolved."}]
    response = to_mlink_response(_request("08102466"), churn_high_s)
    assert response.guardrail.sellAllowed is False
    assert response.recommendations == []
    assert response.signals[0].type == "open_complaint"
    assert response.summary.opportunityScore == 0


def test_maintain_customer_is_healthy_without_recommendations():
    response = to_mlink_response(_request("08100411"), make_context(make_metrics()))
    assert response.summary.relationshipStatus == "healthy"
    assert response.recommendations == []
    assert response.summary.opportunityScore == 21.7
    assert "duy trì chăm sóc" in response.summary.overview.lower()


def test_as_of_date_comes_from_the_application_payload(churn_high_s):
    churn_high_s.metrics = churn_high_s.metrics.model_copy(update={"asOfDate": "2027-01-31"})
    response = to_mlink_response(_request("08102466"), churn_high_s)
    assert response.recommendations[0].evidence[0].sourceReference.endswith(":2027-01-31")


# ── Analysis of a filtered window ────────────────────────────────

def test_response_echoes_the_window_from_the_period_summary(churn_high_s):
    churn_high_s.period_summary = make_period_summary(active_days=0, txn_count=0)
    response = to_mlink_response(_request("08102466", ("2026-08-20", "2026-09-18")), churn_high_s)
    assert response.period is not None
    assert (response.period.from_date, response.period.to, response.period.windowDays) == ("2026-08-20", "2026-09-18", 30)
    # The contract name of the field is `from`, not the Python-safe attribute name.
    assert response.model_dump(by_alias=True)["period"]["from"] == "2026-08-20"


def test_response_falls_back_to_the_requested_window_without_a_summary(churn_high_s):
    response = to_mlink_response(_request("08102466", ("2026-07-01", "2026-09-18")), churn_high_s)
    assert response.period is not None
    assert response.period.windowDays == 80


def test_response_has_no_window_when_none_was_requested(churn_high_s):
    assert to_mlink_response(_request("08102466"), churn_high_s).period is None


def test_signal_and_overview_wording_follows_the_window(casa_surge_h):
    casa_surge_h.metrics = casa_surge_h.metrics.model_copy(update={"windowDays": 30, "prevWindowDays": 30})
    casa_surge_h.period_summary = make_period_summary()
    response = to_mlink_response(_request("08101096", ("2026-08-20", "2026-09-18")), casa_surge_h)
    surge = next(signal for signal in response.signals if signal.type == "casa_surge")
    assert "30 ngày" in surge.description and "90 ngày" not in surge.description
    assert "Kỳ phân tích 2026-08-20 → 2026-09-18 (30 ngày)" in response.summary.overview


def test_period_rule_produces_period_sourced_evidence(casa_surge_h):
    casa_surge_h.period_summary = make_period_summary(casa_start=100_000_000, casa_end=70_000_000)
    response = to_mlink_response(_request("08101096", ("2026-08-20", "2026-09-18")), casa_surge_h)
    drop = next(rec for rec in response.recommendations if rec.type == "retention")
    period_evidence = [item for item in drop.evidence if item.source == "period_summary"]
    assert period_evidence, "expected evidence taken from the period summary"
    assert all(item.sourceReference == "period_summary:08101096:2026-08-20..2026-09-18" for item in period_evidence)
    assert any(signal.type == "casa_drop_in_period" for signal in response.signals)


def test_open_complaint_blocks_selling_even_for_a_window_before_it(churn_high_s):
    """Decision: the guardrail reflects the customer's current state, not the analysed window."""
    churn_high_s.interactions = [
        {"id": "INT-1", "status": "OPEN", "sentiment": "NEGATIVE", "summary": "Complaint is unresolved.",
         "interactionAt": "2026-09-15T00:00:00.000Z"},
    ]
    churn_high_s.period_summary = make_period_summary(from_date="2025-10-01", to_date="2025-10-30")
    response = to_mlink_response(_request("08102466", ("2025-10-01", "2025-10-30")), churn_high_s)
    assert response.guardrail.sellAllowed is False
    assert response.recommendations == []
    assert response.period is not None and response.period.to == "2025-10-30"
