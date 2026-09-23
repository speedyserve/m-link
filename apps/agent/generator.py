"""Consultation wording. The LLM (OpenAI-compatible) only writes the words; rules and
metrics decide what to recommend. Falls back to deterministic Vietnamese templates."""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from openai import OpenAI

from config import settings

logger = logging.getLogger("mlink.generator")

CONSULTATION_SYSTEM_PROMPT = (
    "Bạn là M-Link, trợ lý AI phân tích khách hàng và hỗ trợ bán hàng cho đội ngũ kinh doanh của Ngân hàng MSB (RM/SRM/GDV/BM/KSV). "
    "Nhiệm vụ của bạn: từ các chỉ số đánh giá khách hàng và kịch bản tư vấn đã được quy tắc nghiệp vụ chọn sẵn, "
    "sinh ra lời thoại tư vấn cá nhân hóa và tin nhắn mẫu gửi khách hàng. Bạn KHÔNG được thêm sản phẩm hay lời hứa lãi suất ngoài dữ liệu được cung cấp."
    "\n\nQUY TẮC BẮT BUỘC:\n"
    "1. Viết như một RM đang trò chuyện trực tiếp: câu ngắn, từ thông dụng, mỗi lượt chỉ nói một ý.\n"
    "2. Mở đầu bằng lời hỏi thăm hoặc xin phép trao đổi, sau đó nêu tối đa ba lợi ích dễ hiểu của sản phẩm.\n"
    "3. Chỉ số, bằng chứng và lý do trong dữ liệu là thông tin nội bộ để chọn nội dung. Tuyệt đối không đọc lại cho khách, "
    "không nhắc các cụm như điểm số, tỷ lệ sử dụng hạn mức, chi tiêu quy về tháng, CASA, churn hay khẩu vị rủi ro.\n"
    "4. Giữ đúng thứ tự ưu tiên của các kịch bản đã cho. Tối đa 3 ý chính.\n"
    "5. Tin nhắn SMS không được vượt quá 160 ký tự.\n"
    "6. Tin nhắn Zalo 60-100 từ, thân thiện, có lời chào và lời mời trao đổi.\n"
    "7. Không nêu số dư, số tài khoản, số tiền cụ thể trong tin nhắn gửi khách.\n"
    "8. Không nhận xét khách 'phù hợp' dựa trên hành vi và không tạo cảm giác ngân hàng đang theo dõi chi tiết chi tiêu của khách.\n"
    "9. Nêu lợi ích trước, lời mời trao đổi sau. Lãi suất/ưu đãi chỉ nói 'tham khảo, theo biểu lãi suất hiện hành'.\n"
    "10. Tránh ngôn ngữ hối thúc quá mức hoặc gây lo lắng.\n"
    "11. Xưng hô với khách đúng theo 'Xưng hô với khách' trong dữ liệu đầu vào (anh/chị theo giới tính) — "
    "KHÔNG dùng 'mình' hay 'bạn' để gọi khách.\n"
    "12. KHÔNG mời khách đăng ký tăng/nâng hạn mức thẻ tín dụng. MSB chủ động xét nâng hạn mức; nếu tư vấn thẻ, chỉ nói về dòng thẻ và quyền lợi sản phẩm.\n"
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
    # Concrete rate/fee from the MSB catalogue (see knowledge_base.py), e.g. "Hoàn 10% chi
    # tiêu, tối đa 12 triệu/năm" — used in the script instead of a vague generic phrase.
    rate_or_fee: str = ""
    customer_benefits: list[str] = field(default_factory=list)
    # Other catalogue products the rule would also accept (e.g. bond/CD/M Sinh Lời alongside
    # a fund-cert pitch) — mentioned as options so the RM doesn't sound like they only have one card to play.
    alt_products: list[str] = field(default_factory=list)


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


def _contains_forbidden_card_limit_pitch(data: dict) -> bool:
    text = json.dumps(data, ensure_ascii=False).lower()
    return any(phrase in text for phrase in (
        "nâng hạn mức", "tăng hạn mức", "mở rộng hạn mức",
        "nang han muc", "tang han muc", "mo rong han muc",
    ))


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
                     f"Lý do: {item.rationale} Bằng chứng: {item.evidence} "
                     f"Lợi ích được phép nói với khách: {'; '.join(item.customer_benefits) or 'theo thông tin sản phẩm đã cung cấp'} "
                     f"Lựa chọn thay thế có thể nhắc thêm: {'; '.join(item.alt_products) or 'không có'}")
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
            if data and not _contains_forbidden_card_limit_pitch(data):
                logger.info("consultation_content source=remote model=%s format=%s", settings.llm_model,
                            "json" if response_format else "text")
                return data
            if data:
                logger.warning("consultation_content remote_response_rejected reason=card_limit_pitch")
                break
            logger.warning("consultation_content remote_response_invalid")
        except Exception as error:
            logger.warning("consultation_content remote_request_failed error=%s", type(error).__name__)

    logger.info("consultation_content source=fallback reason=remote_unavailable")
    return _fallback_consultation(customer_name, items, gender)


ASSISTANT_SYSTEM_PROMPT = (
    "Bạn là M-Link, trợ lý AI cho cán bộ RM của Ngân hàng MSB. RM sẽ hỏi bạn về khách hàng "
    "hoặc về danh mục khách hàng của chính họ. Bạn ĐƯỢC cung cấp sẵn phần 'Dữ liệu tra cứu' — "
    "đó là kết quả tra cứu chính xác từ hệ thống.\n"
    "QUY TẮC BẮT BUỘC:\n"
    "1. Chỉ dùng đúng số liệu/tên/ngày tháng có trong 'Dữ liệu tra cứu'. Không suy diễn, "
    "không bịa thêm số liệu nào không có trong đó.\n"
    "2. Nếu 'Dữ liệu tra cứu' không đủ để trả lời câu hỏi, hãy nói rõ là chưa có thông tin đó, "
    "đừng đoán.\n"
    "3. Trả lời ngắn gọn, tự nhiên, đúng trọng tâm câu hỏi, giọng văn như đồng nghiệp trao đổi nhanh.\n"
    "4. Không lặp lại nguyên văn toàn bộ dữ liệu nếu không cần thiết — chỉ nêu phần liên quan tới câu hỏi.\n"
    "Trả lời bằng văn bản thuần, không dùng markdown, không JSON."
)


# Question keyword -> which "Label:" lines in `facts` answer it. Keeps the no-LLM fallback
# terse and on-topic (asset question -> asset line only) instead of dumping every fact —
# the LLM path already does this naturally by reading the whole context, this is just its
# deterministic stand-in for when no LLM key is configured.
_FALLBACK_TOPICS: list[tuple[list[str], list[str]]] = [
    (["sinh nhat", "ngay sinh", "tuoi"], ["ngay sinh:"]),
    (["tai san", "tav", "gia tri"], ["tong tai san:"]),
    (["giao dich"], ["5 giao dich gan nhat:", "giao dich gan nhat:"]),
    (["de xuat", "goi y", "nen tu van", "nen ban", "hanh dong", "nen lam gi"],
     ["danh sach de xuat da luu:", "hanh dong khuyen nghi hien tai:"]),
    (["tong ket", "tom tat", "tong quan", "tinh hinh"], ["tong ket phan tich"]),
    (["uu tien"], ["diem uu tien lien he:"]),
    (["roi bo", "churn", "rui ro cao", "chu y", "giu chan"],
     ["rui ro roi bo:", "so khach rui ro roi bo", "danh sach khach can chu y"]),
    (["chi nhanh"], ["chi nhanh:"]),
    (["cif", "ma khach"], ["cif:"]),
    (["cham soc", "khieu nai", "ban them", "ban hang", "khong nen ban", "dung ban"],
     ["dang cho phep ban them san pham:", "so khach dang tam dung ban", "danh sach khach dang tam dung ban"]),
    (["bao nhieu khach", "quan ly bao nhieu", "tong khach", "so luong khach"], ["tong so khach hang dang quan ly:"]),
    (["rm la ai", "toi la ai", "thong tin cua toi", "thong tin rm", "ho so"], ["rm:"]),
]


def _norm(value: str) -> str:
    ascii_value = unicodedata.normalize('NFD', value)
    ascii_value = re.sub(r'[\u0300-\u036f]', '', ascii_value)
    return ascii_value.replace('đ', 'd').replace('Đ', 'd').lower()


def _fallback_answer(question: str, facts: str) -> str:
    """No-LLM stand-in: picks only the fact line(s) that match the question's topic instead of
    dumping the whole context, so "hỏi tài sản thì ra tài sản" holds even without a live LLM."""
    lines = [line for line in facts.split('\n') if line.strip()]
    normalized_question = _norm(question)
    matched: list[str] = []
    for keywords, label_prefixes in _FALLBACK_TOPICS:
        if not any(kw in normalized_question for kw in keywords):
            continue
        for line in lines:
            normalized_line = _norm(line)
            if any(normalized_line.startswith(prefix) for prefix in label_prefixes):
                matched.append(line)
    if matched:
        # de-duplicate while keeping order
        seen: set[str] = set()
        unique = [m for m in matched if not (m in seen or seen.add(m))]
        return '\n'.join(unique)
    identity = lines[0] if lines else ''
    return (f"{identity}\nChưa rõ bạn muốn hỏi phần nào, bạn hỏi cụ thể hơn nhé "
            f"(ví dụ: tài sản, sinh nhật, giao dịch, đề xuất, tổng kết...).").strip()


def generate_assistant_answer(question: str, facts: str) -> str:
    """Phrase an already-looked-up answer naturally. The facts are computed deterministically
    by the M-Link API (customer counts, churn counts, transaction rows, ...) — the LLM's only
    job is wording, exactly like the consultation script writer above never invents products."""
    client = get_client()
    if client is None or not settings.llm_enabled_for_content:
        return _fallback_answer(question, facts)

    messages = [
        {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT},
        {"role": "user", "content": f"Câu hỏi của RM: {question}\n\nDữ liệu tra cứu:\n{facts}"},
    ]
    try:
        resp = client.chat.completions.create(
            model=settings.llm_model, messages=messages, temperature=settings.llm_temperature,
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            logger.info("assistant_answer source=remote model=%s", settings.llm_model)
            return text
        logger.warning("assistant_answer remote_response_empty")
    except Exception as error:
        logger.warning("assistant_answer remote_request_failed error=%s", type(error).__name__)

    logger.info("assistant_answer source=fallback reason=remote_unavailable")
    return _fallback_answer(question, facts)


def _fallback_consultation(customer_name: str, items: list[TalkingItem], gender: str = "") -> dict:
    pronoun = _pronoun(gender)
    pronoun_ascii = _pronoun_ascii(gender)
    hello = f"Chào {pronoun}"  # never open with the customer's full name — that reads as a form letter, not a real greeting.
    if not items:
        return {
            "opening": f"{hello}, em là cán bộ MSB phụ trách tài khoản của {pronoun}, hôm nay em xin phép hỏi thăm nhu cầu tài chính của {pronoun} ạ.",
            "main_points": [],
            "closing": f"Có gì cần em hỗ trợ thêm {pronoun} cứ nhắn em nhé ạ.",
            "sms": f"MSB kinh chao {pronoun_ascii}! Ben em luon san sang ho tro nhu cau tai chinh cua {pronoun_ascii}. Lien he em de duoc tu van a!",
            "zalo": f"{hello} ạ! Em là cán bộ MSB phụ trách tài khoản của {pronoun}. Khi nào rảnh {pronoun} cho em xin 5-10 phút để trao đổi xem bên em có thể hỗ trợ gì thêm cho {pronoun} nhé ạ!",
        }

    first = items[0]
    if first.rec_type == "retention":
        opening = f"{hello}, dạo này {pronoun} vẫn ổn chứ ạ? Em gọi hỏi thăm và tiện chia sẻ một ưu đãi mới của MSB với {pronoun}."
    elif first.rec_type in {"protection", "restructure"}:
        opening = f"{hello}, em gọi hỏi thăm và xem bên em có thể hỗ trợ {pronoun} sắp xếp các khoản tài chính thuận tiện hơn không ạ."
    elif first.rec_type == "reactivation":
        opening = f"{hello}, dạo này {pronoun} dùng tài khoản MSB có thuận tiện không ạ? Em gọi xem {pronoun} có cần hỗ trợ gì không."
    else:
        opening = f"{hello}, em gọi để chia sẻ một ưu đãi của MSB mà {pronoun} có thể quan tâm ạ."

    def _offer_sentence(item: TalkingItem) -> str:
        if item.rate_or_fee:
            benefit = f"{item.rate_or_fee[0].lower()}{item.rate_or_fee[1:]}".rstrip(".")
            return f"Điểm nổi bật của {item.product_name} là {benefit}."
        return f"Với {item.product_name}, em sẽ kiểm tra ưu đãi hiện hành và gửi {pronoun} thông tin chính xác nhất."

    def _benefit_sentences(item: TalkingItem) -> str:
        return " ".join(f"{benefit.rstrip('.')}." for benefit in item.customer_benefits[:2])

    def _alt_sentence(item: TalkingItem) -> str:
        if not item.alt_products:
            return ""
        names = item.alt_products[:3]
        if len(names) == 1:
            listed = names[0]
        else:
            listed = ", ".join(names[:-1]) + f" hay {names[-1]}"
        return f"Nếu {pronoun} muốn thêm lựa chọn, em cũng có thể tư vấn thêm {listed} để {pronoun} cân nhắc ạ."

    main_points = [
        {
            "order": index,
            "title": item.product_name,
            "talking_point": " ".join(part for part in [
                _offer_sentence(item), _benefit_sentences(item), _alt_sentence(item),
                f"Nếu {pronoun} quan tâm, em gửi thông tin ngắn gọn để {pronoun} xem trước nhé ạ.",
            ] if part),
            "expected_objection": "Tôi cần thời gian suy nghĩ thêm",
            "objection_response": f"Dạ không sao ạ, em sẽ gửi thông tin chi tiết để {pronoun} tham khảo. Khi nào {pronoun} sẵn sàng thì {pronoun} báo em một tiếng nhé.",
        }
        for index, item in enumerate(items[:3], 1)
    ]
    closing = f"{_cap(pronoun)} cần em giải thích thêm phần nào thì nhắn em nhé ạ."
    sms = f"MSB kinh chao {pronoun_ascii}! Ben em co giai phap {first.product_name} phu hop voi nhu cau hien tai cua {pronoun_ascii}. Lien he em de duoc tu van a!"
    zalo = (f"{hello} ạ! Em là cán bộ phụ trách tài khoản của {pronoun} bên MSB. Em muốn giới thiệu {first.product_name} "
            f"với nhiều ưu đãi dành cho {pronoun}. {_cap(pronoun)} sắp xếp cho em 5-10 phút gọi điện hoặc gặp trực tiếp để em trình bày chi tiết nhé. Em cảm ơn {pronoun}!")
    return {"opening": opening, "main_points": main_points, "closing": closing, "sms": sms[:160], "zalo": zalo}
