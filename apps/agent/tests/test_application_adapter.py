from application_adapter import to_mlink_response
from application_client import BankingSnapshot
from models import MLinkAnalyzeRequest


def _request(customer_id: str) -> MLinkAnalyzeRequest:
    return MLinkAnalyzeRequest(
        customerId=customer_id,
        objective="prepare_rm_brief",
        requestedBy="RM001",
        locale="vi",
    )


def _snapshot(customer_id: str, interactions: list[dict] | None = None) -> BankingSnapshot:
    return BankingSnapshot(
        customer={
            "id": customer_id,
            "customerCode": customer_id,
            "fullName": "Lê Polo" if customer_id == "CUS001" else "Hoàng Lan",
            "segment": "PRIORITY",
        },
        accounts=[{"type": "CASA", "balance": "500000000.00"}],
        transactions=[
            {
                "id": "TX001",
                "transactionCode": "TX001",
                "type": "CREDIT",
                "amount": "500000000.00",
                "transactionAt": "2026-09-06T12:00:00.000Z",
            }
        ],
        cards=[],
        deposits=[
            {
                "id": "DEP001",
                "principal": "100000000.00",
                "startDate": "2026-03-22",
                "maturityDate": "2026-09-18",
                "status": "ACTIVE",
            }
        ],
        interactions=interactions or [],
    )


def test_adapter_returns_contract_shaped_sales_opportunity():
    response = to_mlink_response(_request("CUS001"), _snapshot("CUS001"))

    assert response.customerId == "CUS001"
    assert response.guardrail.sellAllowed is True
    assert response.summary.opportunityScore > 0
    assert len(response.recommendations) >= 2
    source_references = {
        recommendation.evidence[0].sourceReference
        for recommendation in response.recommendations
    }
    assert {"TX001", "DEP001"}.issubset(source_references)


def test_adapter_enforces_customer_care_first_before_recommendations():
    response = to_mlink_response(
        _request("CUS002"),
        _snapshot(
            "CUS002",
            [
                {
                    "id": "INT002",
                    "status": "OPEN",
                    "sentiment": "NEGATIVE",
                    "summary": "Complaint is unresolved.",
                }
            ],
        ),
    )

    assert response.guardrail.sellAllowed is False
    assert response.recommendations == []
    assert response.signals[0].type == "open_complaint"
