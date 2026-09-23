"""Turns the Application's customer context (Part B metrics, holdings, NBO, interactions)
into the public M-Link Agent response using the Part D rule engine."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from application_client import CustomerContext, window_days
from generator import TalkingItem, generate_consultation_content
from models import (
    MLinkAnalysisResponse,
    MLinkAnalyzeRequest,
    MLinkEvidence,
    MLinkGuardrail,
    MLinkPeriod,
    MLinkProduct,
    MLinkRecommendation,
    MLinkSignal,
    MLinkSummary,
)
from rules import (
    CHURN_HIGH,
    CUR_HIGH,
    LEVERAGE_HIGH,
    PERIOD_CARD_SPEND_TO_LIMIT,
    PERIOD_CASA_DROP,
    PERIOD_MIN_DAYS_FOR_CARD_SPEND,
    PERIOD_MIN_DAYS_FOR_INACTIVITY,
    RAS_HIGH,
    RECENCY_DORMANT,
    TREND_SURGE,
    PeriodFacts,
    RuleContext,
    RuleHit,
    evaluate,
    evidence_hint,
    evidence_label,
    format_metric,
    format_period,
)

CARE_FIRST_REASON = "Khách đang có khiếu nại chưa xử lý và nhiều lần phản hồi tiêu cực: cần giải quyết khiếu nại, chăm sóc khách trước khi giới thiệu sản phẩm."


def _open_complaints(interactions: list[dict]) -> list[dict]:
    return [
        interaction for interaction in interactions
        if interaction.get("status") == "OPEN" and interaction.get("sentiment") == "NEGATIVE"
    ]


def _round1(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def _response_period(request: MLinkAnalyzeRequest, context: CustomerContext) -> MLinkPeriod | None:
    """The window actually analysed: the Application's resolved range when it sent one."""
    facts = PeriodFacts.from_summary(context.period_summary)
    if facts and facts.from_date and facts.to_date:
        return MLinkPeriod(from_date=facts.from_date, to=facts.to_date, windowDays=facts.days)
    window = window_days(request.periodFrom, request.periodTo)
    if request.periodFrom and request.periodTo and window:
        return MLinkPeriod(from_date=request.periodFrom, to=request.periodTo, windowDays=window)
    return None


def churn_display(label: str) -> str:
    """Collapse the 3-tier churn label to the 2-tier Thấp/Cao the RM-facing UI shows."""
    return label if label == "Thấp" else "Cao"


def build_signals(ctx: RuleContext) -> list[MLinkSignal]:
    """Metric-level signals (Part B/C) plus facts of the analysed window."""
    m = ctx.metrics
    window = m.windowDays
    signals: list[MLinkSignal] = []

    def add(type_: str, title: str, severity: str, confidence: float, description: str) -> None:
        signals.append(MLinkSignal(type=type_, title=title, severity=severity, confidence=confidence, description=description))

    # RM-facing severity only ever reads Thấp/Cao (see churn_display), even though the
    # underlying score keeps 3 internal tiers for the approved MSB formula.
    if m.churnLabel != "Thấp":
        add("churn_high", "Rủi ro rời bỏ CAO", "high", 0.95,
            f"Churn Score {format_metric(m, 'churnScore')} (từ 30/100 trở lên là mức Cao); {m.recencyDays} ngày không phát sinh giao dịch; "
            f"xu hướng CASA {format_metric(m, 'casaTrend')}. Khách có dấu hiệu sẽ rời bỏ ngân hàng — nên gọi giữ chân trước khi tư vấn bán thêm.")
    if m.leverage > LEVERAGE_HIGH:
        add("leverage_high", "Đòn bẩy tài chính cao", "high", 0.97,
            f"Dư nợ vay / tài sản quy đổi = {format_metric(m, 'leverage')} ({format_metric(m, 'loanTotal')} / {format_metric(m, 'tav')}), "
            f"vượt ngưỡng an toàn 70%. Khách đang vay nhiều so với tài sản đang có — không nên chào thêm sản phẩm vay, ưu tiên bảo vệ khả năng trả nợ.")
    if m.cur > CUR_HIGH:
        add("cur_high", "Tỷ lệ dùng hạn mức thẻ cao", "high", 0.93,
            f"Tỷ lệ dùng hạn mức thẻ {window} ngày = {format_metric(m, 'cur')} trên hạn mức {format_metric(m, 'creditLimit')}, vượt ngưỡng 80%. "
            f"Khách đang dùng gần hết hạn mức thẻ, có thể đang gặp áp lực tài chính — cân nhắc tư vấn cơ cấu nợ/trả góp 0% thay vì chào vay mới.")
    elif m.cur > 0.5:
        add("cur_elevated", "Dùng hạn mức thẻ đáng chú ý", "medium", 0.8,
            f"Tỷ lệ dùng hạn mức thẻ {window} ngày = {format_metric(m, 'cur')}, trên mức 50% hạn mức nhưng chưa tới ngưỡng cảnh báo 80%. Nên theo dõi thêm ở kỳ tới.")
    if m.recencyDays > RECENCY_DORMANT:
        add("dormant", "Không giao dịch lâu ngày", "high", 0.9,
            f"{m.recencyDays} ngày kể từ giao dịch gần nhất, vượt ngưỡng 90 ngày được coi là không hoạt động (dormant). "
            f"Nên liên hệ khảo sát nhu cầu trước khi tư vấn bán sản phẩm mới, tránh làm phiền khách nếu chưa rõ lý do ngừng giao dịch.")
    if m.fdLiquidated:
        add("fd_liquidated", "Sổ tiết kiệm đã tất toán giữa kỳ", "medium", 0.9,
            f"FD hiện tại 0 VND, trong khi bình quân cửa sổ liền trước là {format_metric(m, 'fdAvgPrev90')}. "
            f"Khách vừa rút toàn bộ một sổ tiết kiệm — nên tìm hiểu tiền đã chuyển đi đâu để có phương án giữ chân phù hợp.")
    if m.casaTrend > TREND_SURGE:
        add("casa_surge", "CASA tăng mạnh", "medium", 0.9,
            f"CASA bình quân {window} ngày {format_metric(m, 'casaTrend')} so với {window} ngày liền trước ({format_metric(m, 'casaAvg90')}), "
            f"vượt ngưỡng tăng mạnh 10%. Dòng tiền nhàn rỗi đang vào tài khoản — cơ hội tốt để giới thiệu kênh sinh lời (tiết kiệm/đầu tư).")
    elif m.casaTrend < -0.05:
        add("casa_decline", "CASA giảm", "medium", 0.88,
            f"CASA bình quân {window} ngày {format_metric(m, 'casaTrend')}, giảm quá ngưỡng 5%. "
            f"Có thể là dấu hiệu sớm dòng tiền đang rời khỏi MSB — nên tìm hiểu nguyên nhân trước khi dòng tiền giảm sâu hơn.")
    if m.rasRaw > RAS_HIGH and ctx.declared_risk_appetite == "An toàn":
        add("risk_mismatch", "Lệch khẩu vị rủi ro", "medium", 0.85,
            f"RAS thực tế {format_metric(m, 'rasRaw')} (trên 50%) nhưng khách khai báo khẩu vị An toàn. "
            f"Tài sản thực tế đang rủi ro hơn những gì khách khai báo — cần rà soát lại mức độ phù hợp (suitability) trước khi tư vấn thêm sản phẩm đầu tư/FX.")
    elif m.ras > RAS_HIGH:
        add("risk_appetite_high", "Khẩu vị rủi ro thực tế cao", "low", 0.8,
            f"RAS = {format_metric(m, 'ras')} (tỷ trọng Bond + Chứng chỉ quỹ + doanh số FX 12 tháng trên tổng tài sản), trên ngưỡng 50%. "
            f"Khách đã quen với rủi ro cao — phù hợp giới thiệu thêm sản phẩm đầu tư/ngoại hối.")
    if m.phsLabel == "Chưa khai thác":
        add("under_penetrated", "Chưa khai thác sản phẩm", "low", 0.85,
            f"Đang có {m.holdingCount}/13 dòng sản phẩm (PHS {format_metric(m, 'phs')}), dưới ngưỡng 20%. "
            f"Khách mới dùng rất ít sản phẩm MSB — còn nhiều dư địa để giới thiệu thêm dịch vụ phù hợp.")
    if m.valueScore >= 100:
        add("top_value", "Giá trị cao nhất danh mục", "medium", 0.9,
            f"Value Score 100/100, TAV {format_metric(m, 'tav')} — đây là khách hàng có tổng tài sản lớn nhất trong danh mục đang quản lý. "
            f"Nên ưu tiên chăm sóc đặc biệt, tránh mất khách vào tay ngân hàng khác.")

    period = ctx.period
    if period:
        if period.days >= PERIOD_MIN_DAYS_FOR_INACTIVITY and period.active_days == 0:
            add("inactive_in_period", "Không giao dịch trong kỳ", "high", 0.95,
                f"Kỳ {period.label}: {format_period(period, 'activeDays')}. Toàn bộ kỳ đang xem không có ngày nào phát sinh giao dịch — "
                f"nên liên hệ khảo sát nhu cầu ngay trước khi tư vấn bán sản phẩm mới.")
        if period.casa_start > 0 and period.casa_change_ratio <= PERIOD_CASA_DROP:
            add("casa_drop_in_period", "CASA giảm mạnh trong kỳ", "high", 0.9,
                f"CASA {format_period(period, 'casaStart')} → {format_period(period, 'casaEnd')} "
                f"({format_period(period, 'casaChange')}) trong kỳ {period.label}, giảm từ 20% trở lên. "
                f"Dòng tiền có dấu hiệu rõ rệt đang rời khỏi MSB trong chính kỳ đang xem — ưu tiên tìm hiểu nguyên nhân và giữ chân bằng ưu đãi lãi suất.")
        limit = m.amount("creditLimit")
        if (
            period.days >= PERIOD_MIN_DAYS_FOR_CARD_SPEND
            and limit > 0
            and period.monthly_card_spend >= PERIOD_CARD_SPEND_TO_LIMIT * limit
            and m.cur <= CUR_HIGH
        ):
            add("card_spend_high_in_period", "Chi tiêu thẻ cao trong kỳ", "medium", 0.85,
                f"Chi tiêu thẻ {format_period(period, 'cardSpend')} trong kỳ {period.label}, "
                f"quy về tháng {format_period(period, 'cardSpendMonthly')} trên hạn mức {format_metric(m, 'creditLimit')} (từ 50% hạn mức trở lên). "
                f"Khách chi tiêu nhiều và vẫn trả nợ tốt (tỷ lệ dùng hạn mức thẻ chưa vượt 80%) — có thể giới thiệu dòng thẻ hoàn tiền phù hợp; "
                f"không mời nâng hạn mức vì MSB chủ động xét duyệt.")
    return signals


def _headline(ctx: RuleContext) -> str:
    m = ctx.metrics
    window = f"Kỳ phân tích {ctx.period.label}. " if ctx.period else ""
    return (
        f"{window}Khách hàng {ctx.customer.get('tier') or m.tierLabel}, hành vi {m.behaviourLabel.lower()}, "
        f"khẩu vị rủi ro thực tế {m.riskAppetiteLabel.lower()}, rủi ro rời bỏ {churn_display(m.churnLabel).lower()}."
    )


def _confidence(hit: RuleHit, ctx: RuleContext) -> float:
    base = {"high": 0.9, "medium": 0.8, "low": 0.7}.get(hit.rule.severity, 0.7)
    return round(min(0.99, base + 0.09 * min(1.0, ctx.metrics.priorityScore / 100)), 2)


def _recommendation(index: int, hit: RuleHit, ctx: RuleContext, script: str) -> MLinkRecommendation:
    m = ctx.metrics
    product = hit.primary_product
    period_reference = f"period_summary:{m.customerId}:{ctx.period.from_date}..{ctx.period.to_date}" if ctx.period else None
    evidence = [
        MLinkEvidence(
            type="interaction" if item.source == "interaction" else "period" if item.source == "period_summary" else "metric",
            title=evidence_label(item.field),
            description=(
                item.value if item.source == "interaction"
                else f"{evidence_label(item.field)}: {item.value} (kỳ {ctx.period.label})" if item.source == "period_summary" and ctx.period
                else f"{evidence_label(item.field)}: {item.value} (tính đến ngày {m.asOfDate})"
            ),
            source=item.source,
            sourceReference=(
                period_reference if item.source == "period_summary"
                else f"customer_interactions:{m.customerId}" if item.source == "interaction"
                else f"customer_metrics:{m.customerId}:{m.asOfDate}"
            ),
        )
        for item in hit.evidence
    ]
    # Interaction-sourced evidence is already a full sentence (see _health_inquiry_evidence);
    # metric/period evidence still reads as "Label: value" plus its plain-language hint.
    reasons = [hit.rule.rationale] + [
        item.value if item.source == "interaction" else f"{evidence_label(item.field)}: {item.value}{evidence_hint(item.field)}"
        for item in hit.evidence
    ]
    if len(hit.products) > 1:
        reasons.append("Sản phẩm thay thế: " + "; ".join(p.name for p in hit.products[1:]))
    return MLinkRecommendation(
        priority=index, type=hit.rule.rec_type, title=hit.rule.title,
        # "—" in the catalogue means no published rate/fee; don't show it as text.
        description=(f"{product.summary} {'' if product.rate_or_fee == '—' else product.rate_or_fee}" if product else hit.rule.rationale).strip(),
        confidence=_confidence(hit, ctx),
        product=MLinkProduct(
            id=product.product_id, name=product.name,
            eligibility=product.eligibility or None,
            feeOrRate=None if product.rate_or_fee == "—" else product.rate_or_fee,
            talkingPoints=product.talking_points,
        ) if product else None,
        reasons=reasons, evidence=evidence, script=script,
    )


def _script_for(hit: RuleHit, consultation: dict) -> str:
    product_name = hit.primary_product.name if hit.primary_product else hit.rule.title
    point = next((p for p in consultation.get("main_points", []) if p.get("title") == product_name), None)
    talking = (point or {}).get("talking_point") or hit.rule.title
    return " ".join(part for part in [consultation.get("opening", ""), talking, consultation.get("closing", "")] if part)


# Business loans move fast (short cycles, thin cash buffers), so the RM only needs a
# 2-day heads-up; unsecured/mortgage loans get the longer 5-day window the workbook's
# collections practice uses. Overdraft has no fixed due date to remind against, so it's
# left out on purpose.
_LOAN_REMINDER_DAYS = [
    (("kinh doanh",), 2),
    (("tín chấp", "thế chấp", "mua nhà"), 5),
]


def _loan_reminder_note(loans: list[dict], as_of_date: str) -> str:
    """Built from real loan due dates (see customer_loans on the Application side), not
    invented — only fires when a loan's due date actually falls inside its reminder window."""
    try:
        today = date.fromisoformat(str(as_of_date)[:10])
    except ValueError:
        return ""
    notes: list[str] = []
    for loan in loans:
        due_raw = loan.get("nextDueDate")
        loan_type = str(loan.get("loanType") or "")
        if not due_raw or not loan_type:
            continue
        try:
            due = date.fromisoformat(str(due_raw)[:10])
        except ValueError:
            continue
        loan_type_lower = loan_type.lower()
        reminder_days = next((days for keywords, days in _LOAN_REMINDER_DAYS if any(kw in loan_type_lower for kw in keywords)), None)
        if reminder_days is None:
            continue
        days_left = (due - today).days
        if 0 <= days_left <= reminder_days:
            when = "hôm nay" if days_left == 0 else f"còn {days_left} ngày nữa"
            notes.append(f"{loan_type} đến hạn trả nợ ngày {due.strftime('%d/%m/%Y')} ({when}) — nhắc khách chuẩn bị nguồn tiền để trả đúng hạn.")
    if not notes:
        return ""
    return "Nhắc thêm: " + " ".join(notes)


def to_mlink_response(request: MLinkAnalyzeRequest, context: CustomerContext) -> MLinkAnalysisResponse:
    run_id = f"RUN-AGENT-{uuid4()}"
    period = _response_period(request, context)
    # Customer Care First is evaluated on the customer's current state, never narrowed by the
    # analysed window: an open complaint blocks selling even when reviewing an earlier period.
    complaints = _open_complaints(context.interactions)
    if complaints:
        complaint = complaints[0]
        return MLinkAnalysisResponse(
            runId=run_id, customerId=request.customerId, period=period,
            summary=MLinkSummary(relationshipStatus="customer_care_first", opportunityScore=0,
                                 overview="Giải quyết khiếu nại đang mở trước khi trao đổi về bất kỳ sản phẩm nào."),
            signals=[MLinkSignal(type="open_complaint", title="Khiếu nại đang mở", severity="high", confidence=0.99,
                                 description=str(complaint.get("summary") or complaint.get("subject") or "Vấn đề dịch vụ cần được xử lý."))],
            recommendations=[],
            guardrail=MLinkGuardrail(sellAllowed=False, reason=CARE_FIRST_REASON),
        )

    ctx = RuleContext(
        metrics=context.metrics, holdings=context.holdings, next_best_offers=context.next_best_offers,
        customer=context.customer, deposits=context.deposits, interactions=context.interactions,
        period=PeriodFacts.from_summary(context.period_summary),
    )
    hits = evaluate(ctx)
    signals = build_signals(ctx)
    headline = _headline(ctx)

    items = [
        TalkingItem(
            title=hit.rule.title,
            product_name=hit.primary_product.name if hit.primary_product else hit.rule.title,
            rationale=hit.rule.rationale,
            evidence="; ".join(f"{item.field}={item.value}" for item in hit.evidence),
            rec_type=hit.rule.rec_type,
            rate_or_fee="" if not hit.primary_product or hit.primary_product.rate_or_fee == "—" else hit.primary_product.rate_or_fee,
            customer_benefits=hit.primary_product.talking_points if hit.primary_product else [],
            alt_products=[p.name for p in hit.products[1:]],
        )
        for hit in hits
    ]
    consultation = generate_consultation_content(
        str(context.customer.get("fullName") or request.customerId), str(context.customer.get("tier") or ctx.metrics.tierLabel),
        headline, items, period_label=ctx.period.label if ctx.period else "", gender=str(context.customer.get("gender") or ""),
    )
    loan_reminder = _loan_reminder_note(context.loans, ctx.metrics.asOfDate)
    recommendations = [
        _recommendation(
            index, hit, ctx,
            f"{_script_for(hit, consultation)}\n\n{loan_reminder}" if loan_reminder else _script_for(hit, consultation),
        )
        for index, hit in enumerate(hits, start=1)
    ]

    if ctx.metrics.churnLabel == "Cao":
        status = "at_risk"
    elif recommendations:
        status = "opportunity"
    else:
        status = "healthy"
    overview = headline if recommendations else f"{headline} Không có kịch bản tư vấn nào được kích hoạt: duy trì chăm sóc định kỳ."
    return MLinkAnalysisResponse(
        runId=run_id, customerId=request.customerId, period=period,
        summary=MLinkSummary(relationshipStatus=status, opportunityScore=_round1(ctx.metrics.priorityScore), overview=overview),
        signals=signals, recommendations=recommendations,
        guardrail=MLinkGuardrail(sellAllowed=True),
    )
