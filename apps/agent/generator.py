"""Consultation wording. The LLM (OpenAI-compatible) only writes the words; rules and
metrics decide what to recommend. Falls back to deterministic Vietnamese templates."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

from openai import OpenAI

from config import settings

logger = logging.getLogger("mlink.generator")

CONSULTATION_SYSTEM_PROMPT = (
    "Bạn là M-Link, trợ lý AI phân tích khách hàng và hỗ trợ bán hàng cho đội ngũ kinh doanh của Ngân hàng MSB (RM/SRM/GDV/BM/KSV). "
    "Nhiệm vụ của bạn: từ các chỉ số đánh giá khách hàng và kịch bản tư vấn đã được quy tắc nghiệp vụ chọn sẵn, "
    "sinh ra lời thoại tư vấn cá nhân hóa và tin nhắn mẫu gửi khách hàng. Bạn KHÔNG được thêm sản phẩm hay lời hứa lãi suất ngoài dữ liệu được cung cấp."
    "\n\nQUY TẮC BẮT BUỘC:\n"
    "1. Giọng văn tự nhiên như người thật nói chuyện, tránh thuật ngữ kỹ thuật ngân hàng khó hiểu.\n"
    "2. Luôn bắt đầu từ nhu cầu và lợi ích của khách hàng, không bắt đầu bằng việc giới thiệu sản phẩm.\n"
    "3. Mỗi ý chính phải neo vào một chỉ số hoặc sự kiện cụ thể trong dữ liệu.\n"
    "4. Giữ đúng thứ tự ưu tiên của các kịch bản đã cho. Tối đa 3 ý chính.\n"
    "5. Tin nhắn SMS không được vượt quá 160 ký tự.\n"
    "6. Tin nhắn Zalo 60-100 từ, thân thiện, có lời chào và lời mời trao đổi.\n"
    "7. Không nêu số dư, số tài khoản, số tiền cụ thể trong tin nhắn gửi khách.\n"
    "8. Không tạo cảm giác ngân hàng đang theo dõi chi tiết chi tiêu của khách.\n"
    "9. Nêu lợi ích trước, lời mời trao đổi sau. Lãi suất/ưu đãi chỉ nói 'tham khảo, theo biểu lãi suất hiện hành'.\n"
    "10. Tránh ngôn ngữ hối thúc quá mức hoặc gây lo lắng.\n"
    "11. Xưng hô với khách đúng theo 'Xưng hô với khách' trong dữ liệu đầu vào (anh/chị theo giới tính) — "
    "KHÔNG dùng 'mình' hay 'bạn' để gọi khách.\n"
    "\nTrả lời BẮT BUỘC bằng JSON hợp lệ theo schema:\n"
    "{\n"
    '  "opening": "<câu mở đầu tự nhiên, gắn với tình trạng gần đây của khách, tối đa 40 từ>",\n'
    '  "main_points": [\n'
    '    {\n'
    '      "order": 1,\n'
    '      "title": "<tên sản phẩm / kịch bản>",\n'
    '      "talking_point": "<nội dung cán bộ nói với khách, 50-80 từ, giọng tự nhiên, nêu lợi ích cụ thể>",\n'
    '      "expected_objection": "<phản biện khách có thể đưa ra>",\n'
    '      "objection_response": "<cách xử lý phản biện, tối đa 50 từ>"\n'
    '    }\n'
    '  ],\n'
    '  "closing": "<câu chốt và đề xuất bước tiếp theo, tối đa 30 từ>",\n'
    '  "sms": "<tin nhắn SMS tối đa 160 ký tự, không nêu số dư hay số tiền cụ thể>",\n'
    '  "zalo": "<tin nhắn Zalo 60-100 từ, thân thiện hơn, có lời chào và lời mời trao đổi>"\n'
    "}"
)


@dataclass
class TalkingItem:
    """One recommended scenario handed to the writer (product already chosen by the rules)."""

    title: str
    product_name: str
    rationale: str
    evidence: str
    rec_type: str = ""


def _build_client() -> Optional[OpenAI]:
    if not settings.llm_api_key:
        return None
    return OpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_request_timeout_seconds,
        # The SDK retry policy could otherwise exceed the M-Link API deadline.
        max_retries=0,
    )


_cached_client: Optional[OpenAI] = None


def get_client() -> Optional[OpenAI]:
    global _cached_client
    if _cached_client is None:
        _cached_client = _build_client()
    return _cached_client


def _pronoun(gender: str) -> str:
    """Second-person address term for the customer: 'anh' (male), 'chị' (female), or a
    neutral fallback when the gender is missing/unrecognised."""
    normalized = (gender or "").strip().upper()
    if normalized == "MALE":
        return "anh"
    if normalized == "FEMALE":
        return "chị"
    return "anh/chị"


def _pronoun_ascii(gender: str) -> str:
    """Diacritic-free variant for SMS bodies, which avoid Vietnamese accents to stay within
    the GSM-7 160-character budget."""
    normalized = (gender or "").strip().upper()
    if normalized == "MALE":
        return "anh"
    if normalized == "FEMALE":
        return "chi"
    return "anh/chi"


def _cap(pronoun: str) -> str:
    return pronoun[0].upper() + pronoun[1:]


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return None
    return None


def _context(customer_name: str, tier: str, headline: str, items: list[TalkingItem], period_label: str = "", gender: str = "") -> str:
    lines = [
        f"Tên khách hàng: {customer_name}",
        f"Phân hạng: {tier}",
        f"Xưng hô với khách: {_pronoun(gender)}",
        *( [f"Kỳ phân tích: {period_label}"] if period_label else [] ),
        f"Tóm tắt tình trạng: {headline}",
        "",
        "Kịch bản tư vấn đã chọn (thứ tự ưu tiên giảm dần):",
    ]
    for index, item in enumerate(items[:3], 1):
        lines.append(f"{index}. [{item.rec_type.upper()}] {item.title} — Sản phẩm: {item.product_name}. "
                     f"Lý do: {item.rationale} Bằng chứng: {item.evidence}")
    return "\n".join(lines)


def generate_consultation_content(
    customer_name: str, tier: str, headline: str, items: list[TalkingItem], period_label: str = "", gender: str = "",
) -> dict:
    client = get_client()
    context = _context(customer_name, tier, headline, items, period_label, gender)

    if client is None or not settings.llm_enabled_for_content:
        reason = "disabled" if not settings.llm_enabled_for_content else "missing_api_key"
        logger.info("consultation_content source=fallback reason=%s", reason)
        return _fallback_consultation(customer_name, items, gender)

    messages = [
        {"role": "system", "content": CONSULTATION_SYSTEM_PROMPT},
        {"role": "user", "content": context},
    ]
    for response_format in ({"type": "json_object"}, None):
        try:
            kwargs = {"response_format": response_format} if response_format else {}
            resp = client.chat.completions.create(
                model=settings.llm_model, messages=messages, temperature=settings.llm_temperature, **kwargs,
            )
            data = _extract_json(resp.choices[0].message.content or "")
            if data:
                logger.info("consultation_content source=remote model=%s format=%s", settings.llm_model,
                            "json" if response_format else "text")
                return data
            logger.warning("consultation_content remote_response_invalid")
        except Exception as error:
            logger.warning("consultation_content remote_request_failed error=%s", type(error).__name__)

    logger.info("consultation_content source=fallback reason=remote_unavailable")
    return _fallback_consultation(customer_name, items, gender)


def _fallback_consultation(customer_name: str, items: list[TalkingItem], gender: str = "") -> dict:
    pronoun = _pronoun(gender)
    pronoun_ascii = _pronoun_ascii(gender)
    if not items:
        return {
            "opening": f"Chào {customer_name}, em là cán bộ MSB phụ trách tài khoản của {pronoun}, hôm nay em xin phép hỏi thăm nhu cầu tài chính của {pronoun} ạ.",
            "main_points": [],
            "closing": f"Có gì cần em hỗ trợ thêm {pronoun} cứ nhắn em nhé ạ.",
            "sms": f"MSB kinh chao {customer_name}! Ben em luon san sang ho tro nhu cau tai chinh cua {pronoun_ascii}. Lien he em de duoc tu van a!",
            "zalo": f"Chào {customer_name} ạ! Em là cán bộ MSB phụ trách tài khoản của {pronoun}. Khi nào rảnh {pronoun} cho em xin 5-10 phút để trao đổi xem bên em có thể hỗ trợ gì thêm cho {pronoun} nhé ạ!",
        }

    first = items[0]
    if first.rec_type == "retention":
        opening = f"Chào {customer_name}, lâu rồi em chưa được trao đổi với {pronoun}. Em muốn gửi {pronoun} vài ưu đãi dành riêng cho khách hàng ưu tiên của MSB ạ."
    elif first.rec_type in {"protection", "restructure"}:
        opening = f"Chào {customer_name}, em muốn cùng {pronoun} xem lại kế hoạch tài chính để {pronoun} yên tâm hơn với các khoản đang có ạ."
    elif first.rec_type == "reactivation":
        opening = f"Chào {customer_name}, em là cán bộ MSB phụ trách tài khoản của {pronoun}, em xin phép hỏi thăm xem gần đây {pronoun} có cần hỗ trợ gì về tài khoản không ạ."
    else:
        opening = f"Chào {customer_name}, em thấy tình hình tài chính của {pronoun} đang khá tốt. Em có một vài giải pháp phù hợp muốn chia sẻ với {pronoun} ạ."

    main_points = [
        {
            "order": index,
            "title": item.product_name,
            "talking_point": f"{item.title}. {item.rationale} Lãi suất và ưu đãi theo biểu hiện hành của MSB, em sẽ xác nhận lại trước khi {pronoun} quyết định ạ.",
            "expected_objection": "Tôi cần thời gian suy nghĩ thêm",
            "objection_response": f"Dạ không sao ạ, em sẽ gửi thông tin chi tiết để {pronoun} tham khảo. Khi nào {pronoun} sẵn sàng thì {pronoun} báo em một tiếng nhé.",
        }
        for index, item in enumerate(items[:3], 1)
    ]
    closing = f"{_cap(pronoun)} thấy phương án nào phù hợp thì em hỗ trợ {pronoun} làm ngay trên App MSB hoặc tại chi nhánh ạ."
    sms = f"MSB kinh chao {customer_name}! Ben em co giai phap {first.product_name} phu hop voi nhu cau hien tai cua {pronoun_ascii}. Lien he em de duoc tu van a!"
    zalo = (f"Chào {customer_name} ạ! Em là cán bộ phụ trách tài khoản của {pronoun} bên MSB. Em muốn giới thiệu {first.product_name} "
            f"với nhiều ưu đãi dành cho {pronoun}. {_cap(pronoun)} sắp xếp cho em 5-10 phút gọi điện hoặc gặp trực tiếp để em trình bày chi tiết nhé. Em cảm ơn {pronoun}!")
    return {"opening": opening, "main_points": main_points, "closing": closing, "sms": sms[:160], "zalo": zalo}
