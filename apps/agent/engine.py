import logging
from datetime import datetime

from models import (
    CustomerDataInput,
    AnalysisOutput,
    CustomerSummary,
    Signal,
    ScoreBreakdown,
    NextBestAction,
    TimelineEvent,
    MainPoint,
    ConsultationScript,
    CustomerMessage,
)
from scorer import calculate_priority_score, get_heat_level, get_score_breakdown
from signal_extractor import extract_signals, extract_timeline
from generator import generate_consultation_content

logger = logging.getLogger("mlink.engine")


def analyze(customer_data: CustomerDataInput) -> AnalysisOutput:
    cif = customer_data.cif

    if not cif or not customer_data.customer_name:
        return AnalysisOutput(
            status="insufficient_data",
            cif=cif or "UNKNOWN",
            data_gaps=["Thiếu mã CIF hoặc tên khách hàng"],
        )

    if not customer_data.products:
        return AnalysisOutput(
            status="insufficient_data",
            cif=cif,
            data_gaps=["Không có dữ liệu sản phẩm của khách hàng"],
        )

    try:
        total_value = _compute_total_relationship_value(customer_data)
        engagement = _compute_engagement_level(customer_data)
        headline = _build_headline(customer_data, total_value)

        raw_signals = extract_signals(customer_data)

        processed_signals = []
        for rs in raw_signals:
            score = calculate_priority_score(
                rs["signal_type"],
                rs.get("days_to_event"),
                rs["amount_vnd"],
            )
            breakdown = get_score_breakdown(
                rs["signal_type"],
                rs.get("days_to_event"),
                rs["amount_vnd"],
            )
            heat = get_heat_level(score)

            processed_signals.append(Signal(
                product_group=rs["product_group"],
                observed_behavior=rs["observed_behavior"],
                classification=rs["classification"],
                priority_score=score,
                score_breakdown=ScoreBreakdown(**breakdown),
                heat_level=heat,
                keywords=rs["keywords"],
                is_mapped=rs["is_mapped"],
                signal_type=rs.get("signal_type", "unknown"),
                product_id=rs.get("product_id"),
                source_reference=rs.get("source_reference"),
                next_best_action=NextBestAction(**rs["next_best_action"]),
            ))

        processed_signals.sort(key=lambda s: s.priority_score, reverse=True)

        timeline = [
            TimelineEvent(**e)
            for e in extract_timeline(customer_data, customer_data.as_of_date)
        ]

        data_gaps = _detect_data_gaps(customer_data)

        top_signals = processed_signals[:3]
        consultation_raw = generate_consultation_content(
            customer_data.customer_name,
            customer_data.segment,
            headline,
            top_signals,
        )

        main_points = []
        for i, mp in enumerate(consultation_raw.get("main_points", [])[:3], 1):
            main_points.append(MainPoint(
                order=mp.get("order", i),
                title=mp.get("title", ""),
                talking_point=mp.get("talking_point", ""),
                expected_objection=mp.get("expected_objection", ""),
                objection_response=mp.get("objection_response", ""),
            ))

        return AnalysisOutput(
            status="success",
            cif=cif,
            customer_summary=CustomerSummary(
                name=customer_data.customer_name,
                segment=customer_data.segment,
                total_relationship_value_vnd=total_value,
                engagement_level=engagement,
                headline=headline,
            ),
            signals=processed_signals,
            timeline_trend=timeline,
            consultation_script=ConsultationScript(
                opening=consultation_raw.get("opening", ""),
                main_points=main_points,
                closing=consultation_raw.get("closing", ""),
            ),
            customer_message=CustomerMessage(
                sms=consultation_raw.get("sms", ""),
                zalo=consultation_raw.get("zalo", ""),
            ),
            compliance_note=(
                "Toàn bộ nội dung trên là gợi ý tham khảo dựa trên phân tích dữ liệu "
                f"khách hàng tại thời điểm {customer_data.as_of_date or datetime.now().strftime('%Y-%m-%d')}. "
                "Cán bộ kinh doanh cần đối chiếu với chính sách hiện hành của MSB, "
                "xác nhận biểu lãi suất và điều kiện áp dụng mới nhất trước khi tư vấn cho khách hàng. "
                "Mọi quyết định cuối cùng thuộc về cán bộ kinh doanh và khách hàng. "
                "Không cam kết thay MSB về phê duyệt hay mức lãi suất cụ thể."
            ),
            data_gaps=data_gaps,
        )

    except Exception as e:
        logger.exception("Analysis failed for CIF %s", cif)
        return AnalysisOutput(
            status="insufficient_data",
            cif=cif,
            data_gaps=[f"Lỗi trong quá trình phân tích: {str(e)}"],
        )


def _compute_total_relationship_value(data: CustomerDataInput) -> int:
    total = 0
    p = data.products

    if p.casa:
        total += p.casa.average_balance_vnd

    for fd in (p.fixed_deposit or []):
        if isinstance(fd, dict):
            total += fd.get("principal_vnd", 0)
        else:
            total += fd.principal_vnd

    for bond in (p.bond or []):
        if isinstance(bond, dict):
            total += bond.get("holding_value_vnd", 0)
        else:
            total += bond.holding_value_vnd

    return total


def _compute_engagement_level(data: CustomerDataInput) -> str:
    product_count = 0
    p = data.products

    if p.casa:
        product_count += 1
    if p.fixed_deposit:
        product_count += 1
    if p.bond:
        product_count += 1
    if p.credit_card:
        product_count += 1
    if p.vas:
        product_count += 1

    if product_count >= 4:
        return "high"
    elif product_count >= 2:
        return "medium"
    else:
        return "low"


def _build_headline(data: CustomerDataInput, total_value: int) -> str:
    parts = []
    p = data.products

    parts.append(f"Khách hàng {data.segment} tổng quan hệ {total_value:,} VNĐ".replace(",", "."))

    for fd in (p.fixed_deposit or []):
        principal = fd.get("principal_vnd", 0) if isinstance(fd, dict) else fd.principal_vnd
        days = fd.get("days_to_maturity", 999) if isinstance(fd, dict) else fd.days_to_maturity
        if days <= 7:
            parts.append(f"sổ tiết kiệm {principal:,} VNĐ sắp đáo hạn".replace(",", "."))

    if p.credit_card and p.credit_card.top_spending_categories:
        for cat in p.credit_card.top_spending_categories:
            share = cat.get("share", 0) if isinstance(cat, dict) else cat.share
            cat_name = cat.get("category", "") if isinstance(cat, dict) else cat.category
            if "ẩm thực" in cat_name.lower() and share >= 0.4:
                parts.append("chi tiêu ẩm thực chiếm ưu thế")

    return ". ".join(parts) + "."


def _detect_data_gaps(data: CustomerDataInput) -> list[str]:
    gaps = []
    p = data.products

    for bond in (p.bond or []):
        if isinstance(bond, dict):
            issuer = bond.get("issuer_type", "")
            if "trái phiếu" in issuer.lower() and not bond.get("coupon_rate"):
                gaps.append(
                    "Trái phiếu doanh nghiệp: chưa có thông tin về lãi suất coupon "
                    "và số tiền coupon dự kiến nhận được, cần tra cứu thêm từ hệ thống quản lý trái phiếu."
                )
                break

    if p.vas:
        method = ""
        if hasattr(p.vas, "utility_payment_method"):
            method = p.vas.utility_payment_method
        elif isinstance(p.vas, dict):
            method = p.vas.get("utility_payment_method", "")

        if "thủ công" in method.lower() or "manual" in method.lower():
            gaps.append("Chưa có danh sách chi tiết các hóa đơn điện nước và số tiền từng hóa đơn để ước tính giá trị hoàn tiền từ Auto-Debit.")

    return gaps
