import json
import logging
from typing import Optional

from openai import OpenAI

from config import settings
from models import CustomerDataInput, Signal

logger = logging.getLogger("mlink.generator")

CONSULTATION_SYSTEM_PROMPT = (
    "Bạn là M-Link, trợ lý AI phân tích khách hàng và hỗ trợ bán hàng cho đội ngũ kinh doanh của Ngân hàng MSB (RM/SRM/GDV/BM/KSV). "
    "Nhiệm vụ của bạn: từ danh sách tín hiệu khách hàng đã được phân tích, sinh ra kịch bản tư vấn cá nhân hóa và tin nhắn mẫu gửi khách hàng. "
    "\n\nQUY TẮC BẮT BUỘC:\n"
    "1. Giọng văn tự nhiên như người thật nói chuyện, tránh thuật ngữ kỹ thuật ngân hàng khó hiểu.\n"
    "2. Luôn bắt đầu từ nhu cầu và lợi ích của khách hàng, không bắt đầu bằng việc giới thiệu sản phẩm.\n"
    "3. Mỗi ý chính phải neo vào một tín hiệu cụ thể trong dữ liệu.\n"
    "4. Sắp xếp các ý theo thứ tự ưu tiên giảm dần. Tối đa 3 ý chính.\n"
    "5. Tin nhắn SMS không được vượt quá 160 ký tự.\n"
    "6. Tin nhắn Zalo 60-100 từ, thân thiện, có lời chào và lời mời trao đổi.\n"
    "7. Không nêu số dư, số tài khoản, số tiền cụ thể trong tin nhắn gửi khách.\n"
    "8. Không tạo cảm giác ngân hàng đang theo dõi chi tiết chi tiêu của khách.\n"
    "9. Nêu lợi ích trước, lời mời trao đổi sau.\n"
    "10. Tránh ngôn ngữ hối thúc quá mức hoặc gây lo lắng.\n"
    "\nTrả lời BẮT BUỘC bằng JSON hợp lệ theo schema:\n"
    "{\n"
    '  "opening": "<câu mở đầu tự nhiên, gắn với sự kiện gần đây của khách, tối đa 40 từ>",\n'
    '  "main_points": [\n'
    '    {\n'
    '      "order": 1,\n'
    '      "title": "<tiêu đề ý chính>",\n'
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


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    import re
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return None
    return None


def _signals_to_context(
    customer_name: str,
    segment: str,
    headline: str,
    signals: list[Signal],
) -> str:
    lines = [
        f"Tên khách hàng: {customer_name}",
        f"Phân khúc: {segment}",
        f"Tóm tắt tình trạng: {headline}",
        "",
        "Các tín hiệu đã phát hiện (sắp xếp theo ưu tiên giảm dần):",
    ]
    for i, sig in enumerate(signals[:3], 1):
        lines.append(
            f"{i}. [{sig.classification.upper()}] {sig.product_group}: {sig.observed_behavior} "
            f"→ Đề xuất: {sig.next_best_action.action}"
        )
    return "\n".join(lines)


def generate_consultation_content(
    customer_name: str,
    segment: str,
    headline: str,
    signals: list[Signal],
) -> dict:
    client = get_client()
    context = _signals_to_context(customer_name, segment, headline, signals)

    if client is None or not settings.llm_enabled_for_content:
        reason = "disabled" if not settings.llm_enabled_for_content else "missing_api_key"
        logger.info("consultation_content source=fallback reason=%s", reason)
        return _fallback_consultation(customer_name, segment, signals)

    messages = [
        {"role": "system", "content": CONSULTATION_SYSTEM_PROMPT},
        {"role": "user", "content": context},
    ]

    try:
        resp = client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=settings.llm_temperature,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or ""
        data = _extract_json(raw)
        if data:
            logger.info("consultation_content source=remote model=%s format=json", settings.llm_model)
            return data
        logger.warning("consultation_content remote_response_invalid format=json")
    except Exception as error:
        logger.warning("consultation_content remote_request_failed format=json error=%s", type(error).__name__)

    try:
        resp = client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=settings.llm_temperature,
        )
        raw = resp.choices[0].message.content or ""
        data = _extract_json(raw)
        if data:
            logger.info("consultation_content source=remote model=%s format=text", settings.llm_model)
            return data
        logger.warning("consultation_content remote_response_invalid format=text")
    except Exception as error:
        logger.warning("consultation_content remote_request_failed format=text error=%s", type(error).__name__)

    logger.info("consultation_content source=fallback reason=remote_unavailable")
    return _fallback_consultation(customer_name, segment, signals)


def _fallback_consultation(
    customer_name: str,
    segment: str,
    signals: list[Signal],
) -> dict:
    if not signals:
        return {
            "opening": f"Chào {'anh' if 'anh' not in customer_name.lower() else ''} {customer_name}, hôm nay em muốn trao đổi một số thông tin hữu ích về tài chính ạ.",
            "main_points": [],
            "closing": "Anh/chị thấy thế nào ạ? Có gì cần em hỗ trợ thêm không ạ?",
            "sms": f"MSB kinh chao {customer_name}! Ben em co mot so thong tin huu ich ve tai chinh muon chia se. Anh/chi vui long lien he em de duoc tu van chi tiet a!",
            "zalo": f"Chào {customer_name} ạ! Em là cán bộ MSB phụ trách tài khoản của mình. Em có một vài giải pháp tài chính muốn chia sẻ giúp mình tối ưu dòng tiền và sinh lời tốt hơn. Khi nào rảnh mình cho em xin 5-10 phút trao đổi qua điện thoại hoặc gặp trực tiếp nhé ạ!",
        }

    sig = signals[0]
    action_text = sig.next_best_action.action
    product_name = sig.next_best_action.product_name
    deadline = sig.next_best_action.deadline_hint

    opening = ""
    if sig.product_group == "FD" and "đáo hạn" in sig.observed_behavior.lower():
        opening = f"Chào {customer_name}, em thấy sổ tiết kiệm của mình sắp đáo hạn. Em muốn trao đổi với mình một vài phương án để khoản tiền này tiếp tục sinh lời tốt hơn ạ."
    elif sig.product_group == "CASA":
        opening = f"Chào {customer_name}, em thấy dòng tiền kinh doanh của mình đang khá dồi dào. Em có giải pháp giúp mình tối ưu dòng tiền nhàn rỗi mà vẫn linh hoạt sử dụng ạ."
    else:
        opening = f"Chào {customer_name}, em là cán bộ MSB phụ trách tài khoản của mình. Em muốn chia sẻ một số giải pháp tài chính phù hợp với nhu cầu hiện tại của mình ạ."

    main_points = []
    for i, s in enumerate(signals[:3], 1):
        mp = {
            "order": i,
            "title": s.next_best_action.product_name,
            "talking_point": s.next_best_action.action,
            "expected_objection": "Tôi cần thời gian suy nghĩ thêm",
            "objection_response": "Dạ không sao ạ, em sẽ gửi thông tin chi tiết để mình tham khảo. Khi nào mình sẵn sàng thì mình báo em một tiếng nhé.",
        }
        main_points.append(mp)

    closing = f"Anh/chị thấy phương án nào phù hợp thì em hỗ trợ mình làm ngay trên app ạ. Em sẽ ưu tiên liên hệ mình {deadline} ạ."

    sms = f"MSB kinh chao {customer_name}! Ben em co giai phap {product_name} phu hop voi nhu cau hien tai cua minh. Lien he em de duoc tu van ngay a!"

    zalo = f"Chào {customer_name} ạ! Em là cán bộ phụ trách tài khoản của mình bên MSB. Qua theo dõi, em thấy mình đang có một số nhu cầu tài chính mà bên em có giải pháp rất phù hợp. Cụ thể, em muốn giới thiệu {product_name} với nhiều ưu đãi hấp dẫn. Mình sắp xếp thời gian cho em gọi điện hoặc gặp trực tiếp 5-10 phút để em trình bày chi tiết giúp mình nhé. Em cảm ơn mình!"

    return {
        "opening": opening,
        "main_points": main_points,
        "closing": closing,
        "sms": sms[:160],
        "zalo": zalo,
    }
