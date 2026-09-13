"""Transforms banking snapshots into engine input and public M-Link Agent responses."""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from application_client import BankingSnapshot
from engine import analyze
from models import (
    CASAInput,
    CreditCardInput,
    CustomerDataInput,
    FixedDepositInput,
    MLinkAnalysisResponse,
    MLinkAnalyzeRequest,
    MLinkEvidence,
    MLinkGuardrail,
    MLinkProduct,
    MLinkRecommendation,
    MLinkSignal,
    MLinkSummary,
    PaymentHistory,
    ProductsInput,
    SpendingCategory,
)


def _amount(value: object) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return 0


def _as_of_date() -> date:
    return datetime.now(timezone.utc).date()


def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _days_from(value: object, reference: date) -> int:
    parsed = _parse_date(value)
    return max(0, (reference - parsed).days) if parsed else 0


def _days_to(value: object, reference: date) -> int:
    parsed = _parse_date(value)
    return (parsed - reference).days if parsed else 999


def to_engine_input(snapshot: BankingSnapshot) -> CustomerDataInput:
    reference = _as_of_date()
    customer = snapshot.customer
    casa_accounts = [account for account in snapshot.accounts if account.get("type") == "CASA"]
    casa_balance = sum(_amount(account.get("balance")) for account in casa_accounts)
    recent_credit = next(
        (transaction for transaction in snapshot.transactions if transaction.get("type") == "CREDIT"),
        None,
    )
    recent_inflow = None
    if recent_credit:
        recent_inflow = {
            "amount_vnd": _amount(recent_credit.get("amount")),
            "received_date": str(recent_credit.get("transactionAt", ""))[:10],
            "days_idle": _days_from(recent_credit.get("transactionAt"), reference),
            "transaction_code": recent_credit.get("transactionCode") or recent_credit.get("id"),
        }

    deposits = [
        FixedDepositInput(
            account_ref=str(deposit.get("id") or deposit.get("productName") or "FD"),
            principal_vnd=_amount(deposit.get("principal")),
            term_months=max(1, round(max(1, _days_from(deposit.get("startDate"), reference)) / 30)),
            maturity_date=str(deposit.get("maturityDate", "")),
            days_to_maturity=_days_to(deposit.get("maturityDate"), reference),
            # The banking contract does not expose rollover state yet. Golden demo
            # deposits are intentionally non-rollover; a production feed should add it.
            auto_rollover=False,
        )
        for deposit in snapshot.deposits
        if deposit.get("status") == "ACTIVE"
    ]

    debit_transactions = [
        transaction
        for transaction in snapshot.transactions
        if transaction.get("type") == "DEBIT"
    ]
    spend_by_category: dict[str, int] = {}
    for transaction in debit_transactions:
        category = str(transaction.get("category") or "OTHER")
        spend_by_category[category] = spend_by_category.get(category, 0) + _amount(
            transaction.get("amount")
        )
    total_spend = sum(spend_by_category.values())
    card_input = None
    if snapshot.cards:
        card = snapshot.cards[0]
        categories = [
            SpendingCategory(category=name, share=value / total_spend)
            for name, value in sorted(spend_by_category.items(), key=lambda item: item[1], reverse=True)
            if total_spend
        ]
        card_input = CreditCardInput(
            credit_limit_vnd=_amount(card.get("creditLimit")),
            average_monthly_spend_vnd=total_spend,
            utilization_rate=(
                1 - (_amount(card.get("availableLimit")) / _amount(card.get("creditLimit")))
                if _amount(card.get("creditLimit"))
                else 0
            ),
            top_spending_categories=categories,
            # Payment history is not exposed by the current banking schema, so do
            # not manufacture a positive eligibility signal.
            payment_history=PaymentHistory(
                full_payment_rate=0, late_payment_count_12m=0
            ),
        )

    return CustomerDataInput(
        cif=str(customer.get("customerCode") or customer.get("id")),
        customer_name=str(customer.get("fullName") or "Unknown customer"),
        segment=str(customer.get("segment") or ""),
        as_of_date=reference.isoformat(),
        products=ProductsInput(
            casa=CASAInput(
                average_balance_vnd=casa_balance,
                average_balance_range_vnd=[casa_balance, casa_balance],
                recent_inflow=recent_inflow,
            ),
            fixed_deposit=deposits,
            credit_card=card_input,
        ),
    )


def _open_complaints(interactions: list[dict]) -> list[dict]:
    return [
        interaction
        for interaction in interactions
        if interaction.get("status") == "OPEN"
        and interaction.get("sentiment") == "NEGATIVE"
    ]


def _severity(heat: str) -> str:
    return {"high": "high", "medium": "medium"}.get(heat, "low")


def _source_for_product_group(group: str) -> str:
    return {
        "CASA": "transaction",
        "FD": "deposit",
        "CREDIT_CARD": "card",
        "VAS": "interaction",
        "BOND": "account",
    }.get(group, "customer")


def _script_for(signal: object, output: object) -> str:
    consultation = getattr(output, "consultation_script", None)
    if not consultation:
        return signal.next_best_action.action
    point = next(
        (
            item
            for item in consultation.main_points
            if item.title == signal.next_best_action.product_name
        ),
        None,
    )
    talking_point = point.talking_point if point else signal.next_best_action.action
    return " ".join(
        part
        for part in [consultation.opening, talking_point, consultation.closing]
        if part
    )


def to_mlink_response(
    request: MLinkAnalyzeRequest, snapshot: BankingSnapshot
) -> MLinkAnalysisResponse:
    engine_input = to_engine_input(snapshot)
    output = analyze(engine_input)
    complaints = _open_complaints(snapshot.interactions)

    if complaints:
        complaint = complaints[0]
        reason = "Open complaint and repeated negative customer contacts"
        return MLinkAnalysisResponse(
            runId=f"RUN-AGENT-{uuid4()}",
            customerId=request.customerId,
            summary=MLinkSummary(
                relationshipStatus="customer_care_first",
                opportunityScore=0,
                overview="Resolve the open complaint before any product conversation.",
            ),
            signals=[
                MLinkSignal(
                    type="open_complaint",
                    title="Open customer complaint",
                    severity="high",
                    confidence=0.99,
                    description=str(
                        complaint.get("summary")
                        or complaint.get("subject")
                        or "Customer service issue requires resolution."
                    ),
                )
            ],
            recommendations=[],
            guardrail=MLinkGuardrail(sellAllowed=False, reason=reason),
        )

    if output.status != "success" or not output.customer_summary:
        gaps = "; ".join(output.data_gaps) or "No sufficiently strong customer need was identified."
        return MLinkAnalysisResponse(
            runId=f"RUN-AGENT-{uuid4()}",
            customerId=request.customerId,
            summary=MLinkSummary(
                relationshipStatus="healthy", opportunityScore=0, overview=gaps
            ),
            signals=[],
            recommendations=[],
            guardrail=MLinkGuardrail(sellAllowed=True),
        )

    signals = [
        MLinkSignal(
            type=signal.signal_type,
            title=signal.next_best_action.product_name,
            severity=_severity(signal.heat_level),
            confidence=round(signal.priority_score / 100, 2),
            description=signal.observed_behavior,
        )
        for signal in output.signals
    ]
    mapped_signals = [signal for signal in output.signals if signal.is_mapped]
    recommendations = [
        MLinkRecommendation(
            priority=index,
            type=signal.signal_type,
            title=signal.next_best_action.action,
            description=signal.next_best_action.rationale,
            confidence=round(signal.priority_score / 100, 2),
            product=(
                MLinkProduct(
                    id=signal.product_id,
                    name=signal.next_best_action.product_name,
                )
                if signal.product_id
                else None
            ),
            reasons=[signal.observed_behavior, signal.next_best_action.rationale],
            evidence=[
                MLinkEvidence(
                    type=_source_for_product_group(signal.product_group),
                    title=signal.product_group,
                    description=signal.observed_behavior,
                    source=_source_for_product_group(signal.product_group),
                    sourceReference=signal.source_reference,
                )
            ],
            script=_script_for(signal, output),
        )
        for index, signal in enumerate(mapped_signals[:3], start=1)
    ]
    score = max((signal.priority_score for signal in mapped_signals), default=0)
    overview = output.customer_summary.headline
    if not recommendations:
        overview = "No sufficiently strong customer need was identified."
    return MLinkAnalysisResponse(
        runId=f"RUN-AGENT-{uuid4()}",
        customerId=request.customerId,
        summary=MLinkSummary(
            relationshipStatus="opportunity" if recommendations else "healthy",
            opportunityScore=score,
            overview=overview,
        ),
        signals=signals,
        recommendations=recommendations,
        guardrail=MLinkGuardrail(sellAllowed=True),
    )
