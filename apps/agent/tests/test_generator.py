from generator import TalkingItem, _contains_forbidden_card_limit_pitch, _fallback_consultation


def test_customer_script_keeps_internal_metrics_out_of_the_conversation():
    content = _fallback_consultation(
        "Mai Anh Đức",
        [TalkingItem(
            title="Tư vấn thẻ",
            product_name="MSB Visa Signature",
            rationale="Chi tiêu thẻ quy về tháng đạt từ 50% hạn mức trong khi tỷ lệ dùng hạn mức vẫn an toàn.",
            evidence="cur=0.42; monthly_spend_ratio=0.5",
            rec_type="retention",
            rate_or_fee="Hoàn 10% chi tiêu, tối đa 12 triệu/năm.",
            customer_benefits=[
                "Có thêm một nguồn chi tiêu dự phòng",
                "Nếu thẻ đang dùng gặp sự cố, vẫn có thẻ này để thanh toán",
            ],
        )],
        gender="FEMALE",
    )

    script = " ".join([content["opening"], content["main_points"][0]["talking_point"], content["closing"]])
    assert "tỷ lệ" not in script.lower()
    assert "hạn mức" not in script.lower()
    assert "quy về tháng" not in script.lower()
    assert "khá phù hợp" not in script.lower()
    assert "hoàn 10% chi tiêu, tối đa 12 triệu/năm" in script.lower()
    assert "nguồn chi tiêu dự phòng" in script.lower()
    assert "thẻ đang dùng gặp sự cố" in script.lower()
    assert "xem trước" in script.lower()


def test_card_limit_increase_pitch_is_rejected():
    assert _contains_forbidden_card_limit_pitch({"talking_point": "Em hỗ trợ chị đăng ký nâng hạn mức thẻ nhé."})
    assert not _contains_forbidden_card_limit_pitch({"talking_point": "Em gửi chị quyền lợi của dòng thẻ hoàn tiền nhé."})
