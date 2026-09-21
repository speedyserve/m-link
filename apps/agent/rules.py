"""Part D of the MSB framework: the decision matrix that turns Part B metrics into
consultation scenarios with concrete MSB products.

Rules are data: an ordered list evaluated against a `RuleContext`. The order follows the
nested IF of column "Gợi ý kịch bản tư vấn cho RB" in the Excel sheet for the eight
rules it implements, followed by the remaining rows of the docx matrix. Rules that
forbid new lending (`blocks_loans`) suppress loan products from lower-priority rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Callable

from application_client import CustomerContext
from knowledge_base import (
    GROUP_LOAN,
    Product,
    find_product,
    products_for_nbo_family,
)
from models import CustomerMetrics

# Thresholds (Part B/C/D). Kept in one place so tests and docs can reference them.
LEVERAGE_HIGH = 0.7
CUR_HIGH = 0.8
CHURN_HIGH = 60
RAS_HIGH = 0.5
PHS_LOW = 0.2
VALUE_HIGH = 50
TREND_SURGE = 0.10
TREND_POSITIVE = 0.05
RECENCY_DORMANT = 90
CASA_CV_VOLATILE = 0.2
FD_MATURITY_WINDOW_DAYS = 30
MAX_RECOMMENDATIONS = 3

# Thresholds for the period rules. These are NOT in "Khung công thức đánh giá KH MSB": they are an
# extension for analysing a filtered window and still need business approval.
PERIOD_MIN_DAYS_FOR_INACTIVITY = 30
PERIOD_CASA_DROP = -0.20
PERIOD_CARD_SPEND_TO_LIMIT = 0.5
# Monthly-equivalent card spend extrapolates the window, so require a month of data before
# acting on it; a one-week spike must not trigger a card upgrade.
PERIOD_MIN_DAYS_FOR_CARD_SPEND = 30
DAYS_PER_MONTH = 30

# "Thường xuyên" (frequent) proxies: at least this many distinct days with a non-zero flow of
# that category within a window of at least PERIOD_MIN_DAYS_FOR_FREQUENCY days. Business-approval
# pending, same status as the other period rules above.
PERIOD_MIN_DAYS_FOR_FREQUENCY = 30
SECURITIES_ACTIVE_MIN_DAYS = 5
FLIGHT_ACTIVE_MIN_DAYS = 3

# Coverage-extension rules (see RULES tail below): thresholds well above a "nothing going on"
# customer's typical numbers, so a healthy MAINTAIN customer keeps getting zero recommendations.
STARTER_CARD_MIN_FREQ90 = 150


@dataclass
class PeriodFacts:
    """Facts of the analysed window, from GET /internal/customers/:id/period-summary."""

    from_date: str
    to_date: str
    days: int
    active_days: int
    txn_count: int
    casa_start: float
    casa_end: float
    card_spend: float
    card_spend_days: int
    securities_total: float
    securities_days: int
    flight_total: float
    flight_days: int

    @classmethod
    def from_summary(cls, summary: dict | None) -> "PeriodFacts | None":
        if not summary:
            return None
        window = summary.get("range") or {}
        balances = summary.get("balances") or {}
        flows = summary.get("flows") or {}
        activity = summary.get("activity") or {}
        casa = balances.get("casaBalance") or {}
        card = flows.get("CC_SPEND") or {}
        securities = flows.get("SECURITIES") or {}
        flight = flows.get("AIRLINE") or {}

        def number(value: object) -> float:
            try:
                return float(value)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                return 0.0

        return cls(
            from_date=str(window.get("from") or ""),
            to_date=str(window.get("to") or ""),
            days=int(number(window.get("days"))),
            active_days=int(number(activity.get("activeDays"))),
            txn_count=int(number(activity.get("txnCount"))),
            casa_start=number(casa.get("start")),
            casa_end=number(casa.get("end")),
            card_spend=number(card.get("total")),
            card_spend_days=int(number(card.get("days"))),
            securities_total=number(securities.get("total")),
            securities_days=int(number(securities.get("days"))),
            flight_total=number(flight.get("total")),
            flight_days=int(number(flight.get("days"))),
        )

    @property
    def casa_change_ratio(self) -> float:
        return (self.casa_end - self.casa_start) / self.casa_start if self.casa_start else 0.0

    @property
    def monthly_card_spend(self) -> float:
        return self.card_spend / self.days * DAYS_PER_MONTH if self.days else 0.0

    @property
    def label(self) -> str:
        return f"{self.from_date} → {self.to_date} ({self.days} ngày)"


@dataclass
class RuleContext:
    metrics: CustomerMetrics
    holdings: dict[str, bool]
    next_best_offers: dict[str, int | None]
    customer: dict
    deposits: list[dict] = field(default_factory=list)
    # Present only when the Application asked for a filtered window.
    period: PeriodFacts | None = None

    @property
    def as_of(self) -> date:
        return date.fromisoformat(self.metrics.asOfDate[:10])

    @property
    def declared_risk_appetite(self) -> str:
        return str(self.customer.get("declaredRiskAppetite") or "")

    @property
    def note(self) -> str:
        return str(self.customer.get("behaviourNote") or "").lower()

    def holds(self, code: str) -> bool:
        return bool(self.holdings.get(code))

    def fd_maturing_within(self, days: int) -> bool:
        """True when an ACTIVE deposit has a maturity date inside the window (dataset feeds may add it later)."""
        for deposit in self.deposits:
            maturity = deposit.get("maturityDate")
            if deposit.get("status") != "ACTIVE" or not maturity:
                continue
            try:
                delta = (date.fromisoformat(str(maturity)[:10]) - self.as_of).days
            except ValueError:
                continue
            if 0 <= delta <= days:
                return True
        return False

    def fd_event(self) -> bool:
        """FD maturing soon, or liquidated in the previous quarter (the workbook has no maturity dates)."""
        return self.fd_maturing_within(FD_MATURITY_WINDOW_DAYS) or self.metrics.fdLiquidated

    def top_nbo_products(self) -> list[Product]:
        """Products of the unheld families ranked by the sheet "Next Best Offer" (rank 1 first)."""
        ranked = sorted(
            ((rank, family) for family, rank in self.next_best_offers.items() if rank is not None),
            key=lambda item: item[0],
        )
        products: list[Product] = []
        for _, family in ranked:
            products.extend(products_for_nbo_family(family))
        return products

    @property
    def age(self) -> int | None:
        dob = self.customer.get("dateOfBirth")
        if not dob:
            return None
        try:
            birth = date.fromisoformat(str(dob)[:10])
        except ValueError:
            return None
        reference = self.as_of
        return reference.year - birth.year - ((reference.month, reference.day) < (birth.month, birth.day))


@dataclass(frozen=True)
class Rule:
    code: str
    priority: int
    rec_type: str
    severity: str
    title: str
    rationale: str
    condition: Callable[[RuleContext], bool]
    products: Callable[[RuleContext], list[str]]
    evidence_fields: tuple[str, ...]
    blocks_loans: bool = False
    is_advisory: bool = False   # advisory rules carry no product and never count as a sale
    period_evidence: tuple[str, ...] = ()   # facts of the analysed window, see PERIOD_EVIDENCE
    period_rule: bool = False               # extension beyond the docx matrix


@dataclass(frozen=True)
class EvidenceItem:
    field: str
    value: str
    source: str = "customer_metrics"


@dataclass
class RuleHit:
    rule: Rule
    products: list[Product]
    evidence: list[EvidenceItem]

    @property
    def primary_product(self) -> Product | None:
        return self.products[0] if self.products else None


def _pct(value: float, digits: int = 1) -> str:
    return f"{value * 100:.{digits}f}%"


def _ratio(value: float) -> str:
    return f"{value:.2f}x" if value > 2 else _pct(value)


def _money(value: float) -> str:
    return f"{value:,.0f} VND".replace(",", ".")


def format_metric(metrics: CustomerMetrics, field_name: str) -> str:
    value = getattr(metrics, field_name)
    if field_name in {"casaTrend"}:
        return f"{'+' if value > 0 else ''}{_pct(value)}"
    if field_name in {"cur", "phs", "ras", "casaCv"}:
        return _pct(value)
    if field_name == "leverage":
        return _ratio(value)
    if field_name in {"churnScore", "valueScore", "crossSellScore", "priorityScore"}:
        return f"{value:.1f}/100"
    if field_name in {"recencyDays", "freq90", "freqPrev90", "holdingCount"}:
        return str(value)
    if isinstance(value, str) and value.replace(".", "", 1).replace("-", "", 1).isdigit():
        return _money(float(value))
    return str(value)


PERIOD_EVIDENCE: dict[str, Callable[[PeriodFacts], str]] = {
    "periodDays": lambda p: f"{p.days} ngày",
    "activeDays": lambda p: f"{p.active_days}/{p.days} ngày có giao dịch",
    "txnCount": lambda p: f"{p.txn_count} giao dịch",
    "casaStart": lambda p: _money(p.casa_start),
    "casaEnd": lambda p: _money(p.casa_end),
    "casaChange": lambda p: f"{'+' if p.casa_change_ratio > 0 else ''}{_pct(p.casa_change_ratio)}",
    "cardSpend": lambda p: _money(p.card_spend),
    "cardSpendMonthly": lambda p: _money(p.monthly_card_spend),
    "securitiesTotal": lambda p: _money(p.securities_total),
    "securitiesDays": lambda p: f"{p.securities_days}/{p.days} ngày",
    "flightTotal": lambda p: _money(p.flight_total),
    "flightDays": lambda p: f"{p.flight_days}/{p.days} ngày",
}


def format_period(period: PeriodFacts, field_name: str) -> str:
    formatter = PERIOD_EVIDENCE.get(field_name)
    return formatter(period) if formatter else ""


# Human-readable Vietnamese labels for evidence fields shown to RMs (not developers).
# Keep in sync with every `evidence_fields`/`period_evidence` tuple used by RULES below.
EVIDENCE_LABELS: dict[str, str] = {
    "leverage": "Đòn bẩy nợ trên tài sản",
    "loanTotal": "Tổng dư nợ vay",
    "tav": "Tổng tài sản quy đổi",
    "cur": "Tỷ lệ dùng hạn mức thẻ tín dụng",
    "ccAvgBalance90": "Dư nợ thẻ tín dụng bình quân 90 ngày",
    "creditLimit": "Hạn mức thẻ tín dụng",
    "churnScore": "Điểm rủi ro rời bỏ",
    "recencyDays": "Số ngày không giao dịch gần nhất",
    "casaTrend": "Xu hướng số dư CASA 90 ngày",
    "rasRaw": "Tỷ trọng tài sản rủi ro thực tế",
    "fxVolume12m": "Doanh số ngoại tệ 12 tháng",
    "fdCurrent": "Số dư tiền gửi có kỳ hạn hiện tại",
    "fdAvgPrev90": "Số dư tiền gửi có kỳ hạn bình quân 90 ngày trước",
    "phs": "Tỷ lệ sở hữu sản phẩm",
    "valueScore": "Điểm giá trị khách hàng",
    "holdingCount": "Số sản phẩm đang sở hữu",
    "casaAvg90": "Số dư CASA bình quân 90 ngày",
    "ras": "Tỷ trọng tài sản rủi ro",
    "casaCv": "Độ biến động số dư CASA",
    "freq90": "Số giao dịch trong 90 ngày gần nhất",
    "freqPrev90": "Số giao dịch trong 90 ngày trước đó",
    "periodDays": "Số ngày trong kỳ phân tích",
    "activeDays": "Số ngày có giao dịch trong kỳ",
    "txnCount": "Số giao dịch trong kỳ",
    "casaStart": "Số dư CASA đầu kỳ",
    "casaEnd": "Số dư CASA cuối kỳ",
    "casaChange": "Mức thay đổi CASA trong kỳ",
    "riskAppetiteLabel": "Khẩu vị rủi ro thực tế",
    "cardSpend": "Chi tiêu thẻ trong kỳ",
    "cardSpendMonthly": "Chi tiêu thẻ quy đổi theo tháng",
    "securitiesTotal": "Tổng giá trị nạp tiền chứng khoán trong kỳ",
    "securitiesDays": "Số ngày có phát sinh giao dịch nạp tiền chứng khoán trong kỳ",
    "flightTotal": "Tổng giá trị mua vé máy bay trong kỳ",
    "flightDays": "Số ngày mua vé máy bay trong kỳ",
}


# Plain-language meaning shown after score-type evidence so the RM knows how to read it.
EVIDENCE_HINTS: dict[str, str] = {
    "valueScore": "quy mô tổng tài sản của khách so với khách có tài sản lớn nhất danh mục (100 = lớn nhất; càng cao khách càng giá trị)",
    "churnScore": "càng cao khách càng có nguy cơ rời bỏ ngân hàng",
    "phs": "số nhóm sản phẩm khách đang dùng trên tổng số nhóm MSB cung cấp",
}


def evidence_label(field_name: str) -> str:
    return EVIDENCE_LABELS.get(field_name, field_name)


def evidence_hint(field_name: str) -> str:
    hint = EVIDENCE_HINTS.get(field_name)
    return f" — {hint}" if hint else ""


def _invest_products(ctx: RuleContext) -> list[str]:
    ids = ["CD_MSB"]
    if ctx.metrics.riskAppetiteLabel in {"Cân bằng", "Rủi ro cao"}:
        ids.append("BANCA_PRU_INVEST")
    return ids


def _fd_products(ctx: RuleContext) -> list[str]:
    if ctx.metrics.casaTrend < 0:
        return ["DEP_ONLINE", "DEP_HIGHEST_RATE"]        # retain first, no cross-sell
    return ["DEP_HIGHEST_RATE", "CD_MSB"]                # renew longer or move part into CDs


def _nbo_products(ctx: RuleContext) -> list[str]:
    ids = [product.product_id for product in ctx.top_nbo_products()]
    return ids or ["CARD_MC_GREEN_WORLD", "BANCA_PRU_INVEST", "FX_SWIFT_PACKAGE"]


def _securities_products(ctx: RuleContext) -> list[str]:
    ids = ["INV_FUND_CERT_RB", "INV_BOND_RB"]
    if ctx.metrics.riskAppetiteLabel in {"Cân bằng", "Rủi ro cao"}:
        ids.append("BANCA_PRU_INVEST")
    return ids


def _flight_products(ctx: RuleContext) -> list[str]:
    if ctx.metrics.tierLabel == "Aff":
        return ["CARD_MC_WORLD_ELITE", "CARD_MC_GREEN_WORLD"]
    return ["CARD_MC_GREEN_WORLD"]


RULES: list[Rule] = [
    Rule(
        code="LEVERAGE_HIGH", priority=1, rec_type="protection", severity="high",
        title="Bảo vệ khoản vay bằng Bảo hiểm liên kết chung Pru – Bảo vệ tối đa; KHÔNG chào vay thêm",
        rationale="Tổng dư nợ vay vượt 70% tài sản quy đổi: ưu tiên bảo vệ dòng trả nợ, không tăng thêm áp lực tín dụng.",
        condition=lambda ctx: ctx.metrics.leverage > LEVERAGE_HIGH,
        products=lambda ctx: ["BANCA_PRU_PROTECT"],
        evidence_fields=("leverage", "loanTotal", "tav"), blocks_loans=True,
    ),
    Rule(
        code="CUR_HIGH", priority=2, rec_type="restructure", severity="high",
        title="Tư vấn cơ cấu lại dòng tiền / trả góp 0% (Green World); KHÔNG chào vay mới",
        rationale="Tỷ lệ dùng hạn mức thẻ tín dụng trên 80% trong 90 ngày cho thấy áp lực tài chính từ thẻ.",
        condition=lambda ctx: ctx.metrics.cur > CUR_HIGH,
        products=lambda ctx: ["CARD_MC_GREEN_WORLD"],
        evidence_fields=("cur", "ccAvgBalance90", "creditLimit"), blocks_loans=True,
    ),
    Rule(
        code="CHURN_HIGH", priority=3, rec_type="retention", severity="high",
        title="Gọi giữ chân: Tiết kiệm lãi suất cao nhất kèm ưu đãi KHƯT, hẹn gặp trực tiếp",
        rationale="Điểm rủi ro rời bỏ từ 60 trở lên: giữ chân bằng chính sách lãi suất KHƯT trước khi bán thêm.",
        condition=lambda ctx: ctx.metrics.churnScore >= CHURN_HIGH,
        products=lambda ctx: ["DEP_ONLINE", "DEP_HIGHEST_RATE"],
        evidence_fields=("churnScore", "recencyDays", "casaTrend"),
    ),
    Rule(
        code="RISK_MISMATCH", priority=4, rec_type="advisory", severity="medium",
        title="Cảnh báo lệch khẩu vị rủi ro — rà soát suitability trước khi tư vấn đầu tư/FX",
        rationale="Khẩu vị khai báo An toàn nhưng tỷ trọng Bond/CCQ/FX thực tế vượt 50% tài sản.",
        condition=lambda ctx: ctx.metrics.rasRaw > RAS_HIGH and ctx.declared_risk_appetite == "An toàn",
        products=lambda ctx: [],
        evidence_fields=("rasRaw", "fxVolume12m"), is_advisory=True,
    ),
    Rule(
        code="FD_EVENT", priority=5, rec_type="deposit", severity="medium",
        title="Tái tục / giữ chân tiền gửi quanh sự kiện FD",
        rationale="FD đáo hạn trong 30 ngày hoặc vừa tất toán: xu hướng CASA quyết định tái tục kỳ hạn dài hơn hay giữ chân bằng ưu đãi KHƯT.",
        condition=lambda ctx: ctx.fd_event(),
        products=_fd_products,
        evidence_fields=("fdCurrent", "fdAvgPrev90", "casaTrend"),
    ),
    Rule(
        code="UNDER_PENETRATED", priority=6, rec_type="cross_sell", severity="medium",
        title="Khách hàng giá trị cao chưa khai thác — cross-sell toàn diện theo Next Best Offer",
        rationale="Product Holding dưới 20% trong khi Value Score trên 50: dư địa bán chéo lớn.",
        condition=lambda ctx: ctx.metrics.phs < PHS_LOW and ctx.metrics.valueScore > VALUE_HIGH,
        products=_nbo_products,
        evidence_fields=("phs", "valueScore", "holdingCount"),
    ),
    Rule(
        code="CASA_SURGE_NO_BOND", priority=7, rec_type="investment", severity="medium",
        title="CASA tăng mạnh, chưa có Bond — giới thiệu Chứng chỉ tiền gửi MSB / Pru – Đầu tư vững tiến",
        rationale="CASA bình quân 90 ngày tăng trên 10% và khách chưa sở hữu Bond: chuyển tiền nhàn rỗi sang kênh sinh lời.",
        condition=lambda ctx: ctx.metrics.casaTrend > TREND_SURGE and not ctx.holds("BOND"),
        products=_invest_products,
        evidence_fields=("casaTrend", "casaAvg90", "ras"),
    ),
    Rule(
        code="NEW_CIF_ONBOARDING", priority=8, rec_type="onboarding", severity="low",
        title="Onboarding: Tài khoản số đẹp, thẻ ghi nợ Napas/Hybrid, Tiết kiệm trả lãi ngay kỳ hạn ngắn",
        rationale="CIF mới dưới 90 ngày với CASA tăng đều: xây bộ sản phẩm nền tảng.",
        condition=lambda ctx: ctx.metrics.isNewCif and ctx.metrics.casaTrend > TREND_POSITIVE,
        products=lambda ctx: ["ACC_NICE_NUMBER", "CARD_NAPAS_DEBIT", "DEP_UPFRONT_INTEREST"],
        evidence_fields=("casaTrend", "recencyDays"),
    ),
    Rule(
        code="BUSINESS_CASHFLOW_VOLATILE", priority=9, rec_type="liquidity", severity="medium",
        title="Dòng tiền kinh doanh biến động — Thấu chi tiêu dùng hoặc Cho vay bổ sung vốn kinh doanh",
        rationale="Hệ số biến động CASA cao ở khách có dấu hiệu kinh doanh: bù đắp thanh khoản ngắn hạn.",
        condition=lambda ctx: ctx.metrics.casaCv > CASA_CV_VOLATILE and (
            ctx.holds("LOAN_OVERDRAFT") or ctx.holds("LOAN_UNSECURED") or ctx.holds("LOAN_ADVANCE") or "kinh doanh" in ctx.note
        ),
        products=lambda ctx: ["LOAN_OVERDRAFT_CONSUMER", "LOAN_BUSINESS_CAPITAL"],
        evidence_fields=("casaCv", "casaAvg90"),
    ),
    Rule(
        code="FX_ACTIVE", priority=10, rec_type="cross_sell", severity="low",
        title="FX phát sinh thường xuyên — gói ưu đãi tỷ giá / chuyển tiền quốc tế SWIFT",
        rationale="Doanh số FX 12 tháng lớn và khẩu vị rủi ro thực tế cao: tối ưu chi phí ngoại tệ, kèm cảnh báo rủi ro tỷ giá.",
        condition=lambda ctx: ctx.metrics.amount("fxVolume12m") > 0 and ctx.metrics.ras > RAS_HIGH,
        products=lambda ctx: ["FX_SWIFT_PACKAGE"],
        evidence_fields=("fxVolume12m", "ras"),
    ),
    Rule(
        code="SECURITIES_ACTIVE_IN_PERIOD", priority=11, rec_type="cross_sell", severity="low",
        title="Đầu tư chứng khoán thường xuyên — giới thiệu Chứng chỉ quỹ / Trái phiếu phân phối qua RB",
        rationale="Phát sinh giao dịch chứng khoán nhiều ngày trong kỳ: khách có thói quen đầu tư, phù hợp mở rộng sang kênh chứng chỉ quỹ/trái phiếu do MSB phân phối.",
        condition=lambda ctx: bool(
            ctx.period
            and ctx.period.days >= PERIOD_MIN_DAYS_FOR_FREQUENCY
            and ctx.period.securities_days >= SECURITIES_ACTIVE_MIN_DAYS
        ),
        products=_securities_products,
        evidence_fields=("ras",),
        period_evidence=("securitiesTotal", "securitiesDays"), period_rule=True,
    ),
    Rule(
        code="FLIGHT_ACTIVE_IN_PERIOD", priority=12, rec_type="cross_sell", severity="low",
        title="Hay mua vé máy bay — giới thiệu thẻ tín dụng hoàn tiền/di chuyển MSB Mastercard",
        rationale="Mua vé máy bay nhiều lần trong kỳ: khách di chuyển thường xuyên, phù hợp thẻ có ưu đãi hoàn tiền di chuyển và phòng chờ sân bay.",
        condition=lambda ctx: bool(
            ctx.period
            and ctx.period.days >= PERIOD_MIN_DAYS_FOR_FREQUENCY
            and ctx.period.flight_days >= FLIGHT_ACTIVE_MIN_DAYS
        ),
        products=_flight_products,
        evidence_fields=(),
        period_evidence=("flightTotal", "flightDays"), period_rule=True,
    ),
    Rule(
        code="DORMANT", priority=13, rec_type="reactivation", severity="medium",
        title="Không phát sinh giao dịch trên 90 ngày — khảo sát nhu cầu, kích hoạt lại qua App MSB",
        rationale="Recency vượt 90 ngày: ưu tiên nối lại quan hệ giao dịch trước khi tư vấn sản phẩm.",
        condition=lambda ctx: ctx.metrics.recencyDays > RECENCY_DORMANT,
        products=lambda ctx: ["APP_REACTIVATION"],
        evidence_fields=("recencyDays", "freq90", "freqPrev90"),
    ),
    # ---- Period rules: extension beyond the docx matrix, pending business approval ----
    Rule(
        code="INACTIVE_IN_PERIOD", priority=14, rec_type="reactivation", severity="high",
        title="Không phát sinh giao dịch nào trong kỳ đã chọn — khảo sát nhu cầu, kích hoạt lại qua App MSB",
        rationale="Toàn bộ kỳ phân tích không có ngày nào phát sinh giao dịch: nối lại quan hệ trước khi tư vấn sản phẩm.",
        condition=lambda ctx: bool(
            ctx.period and ctx.period.days >= PERIOD_MIN_DAYS_FOR_INACTIVITY and ctx.period.active_days == 0
        ),
        products=lambda ctx: ["APP_REACTIVATION"],
        evidence_fields=("recencyDays",), period_evidence=("periodDays", "activeDays"), period_rule=True,
    ),
    Rule(
        code="CASA_DROP_IN_PERIOD", priority=15, rec_type="retention", severity="high",
        title="Số dư CASA giảm mạnh trong kỳ — ưu tiên giữ chân bằng ưu đãi lãi suất, tìm hiểu dòng tiền đi đâu",
        rationale="Số dư CASA cuối kỳ giảm từ 20% so với đầu kỳ: dòng tiền có dấu hiệu rời khỏi MSB.",
        condition=lambda ctx: bool(
            ctx.period and ctx.period.casa_start > 0 and ctx.period.casa_change_ratio <= PERIOD_CASA_DROP
        ),
        products=lambda ctx: ["DEP_ONLINE", "DEP_PARTIAL_WITHDRAWAL"],
        evidence_fields=("casaAvg90",),
        period_evidence=("casaStart", "casaEnd", "casaChange"), period_rule=True,
    ),
    Rule(
        code="CARD_SPEND_HIGH_IN_PERIOD", priority=16, rec_type="cross_sell", severity="medium",
        title="Chi tiêu thẻ trong kỳ ở mức cao — đề xuất nâng hạng thẻ hoàn tiền",
        rationale="Chi tiêu thẻ quy về tháng đạt từ 50% hạn mức trong khi tỷ lệ dùng hạn mức vẫn an toàn: khách dùng thẻ nhiều và trả tốt.",
        condition=lambda ctx: bool(
            ctx.period
            and ctx.period.days >= PERIOD_MIN_DAYS_FOR_CARD_SPEND
            and ctx.metrics.amount("creditLimit") > 0
            and ctx.period.monthly_card_spend >= PERIOD_CARD_SPEND_TO_LIMIT * ctx.metrics.amount("creditLimit")
            and ctx.metrics.cur <= CUR_HIGH
        ),
        products=lambda ctx: ["CARD_VISA_SIGNATURE", "CARD_MC_WORLD_ELITE"],
        evidence_fields=("cur", "creditLimit"),
        period_evidence=("cardSpend", "cardSpendMonthly"), period_rule=True,
    ),
    # ---- Coverage-extension rules: reach catalogue products no rule above ever offers.
    # Business-approval pending, same status as the period rules above — thresholds are placeholders.
    Rule(
        code="HEALTH_PROTECTION_GAP", priority=17, rec_type="protection", severity="low",
        title="Chưa có bảo hiểm sức khỏe — giới thiệu gói bảo vệ sức khỏe phù hợp",
        rationale="Khách hàng từ 30 tuổi trở lên nhưng chưa sở hữu sản phẩm bảo hiểm nhân thọ/phi nhân thọ nào: còn khoảng trống bảo vệ sức khỏe.",
        condition=lambda ctx: bool(
            ctx.age is not None and ctx.age >= 30 and not ctx.holds("BANCA_LIFE") and not ctx.holds("BANCA_NONLIFE")
        ),
        products=lambda ctx: ["BANCA_M_FLEXCARE"] if ctx.metrics.tierLabel in {"Aff", "MassAff"} else ["BANCA_HOSPITAL_CASH", "BANCA_CRITICAL_ILLNESS"],
        evidence_fields=("holdingCount", "valueScore"),
    ),
    Rule(
        code="PROPERTY_INSURANCE_GAP", priority=18, rec_type="protection", severity="low",
        title="Đang vay thế chấp nhưng chưa có bảo hiểm căn hộ — giới thiệu Bảo hiểm chung cư 4.0",
        rationale="Khách hàng đang có khoản vay thế chấp nhưng chưa sở hữu bảo hiểm phi nhân thọ: nên bảo vệ tài sản đảm bảo khoản vay.",
        condition=lambda ctx: ctx.holds("LOAN_MORTGAGE") and not ctx.holds("BANCA_NONLIFE"),
        products=lambda ctx: ["BANCA_APARTMENT"],
        evidence_fields=("loanTotal", "tav"),
    ),
    Rule(
        code="HOME_LOAN_PROSPECT", priority=19, rec_type="cross_sell", severity="low",
        title="Khách hàng giá trị cao chưa vay mua nhà — giới thiệu Vay mua nhà dự án",
        rationale="Value Score cao, đòn bẩy còn thấp và chưa vay thế chấp: còn dư địa vay mua nhà dự án với lãi suất ưu đãi giai đoạn đầu.",
        condition=lambda ctx: bool(
            ctx.metrics.tierLabel in {"Aff", "MassAff"}
            and not ctx.holds("LOAN_MORTGAGE")
            and ctx.metrics.leverage < LEVERAGE_HIGH
            and ctx.metrics.valueScore > VALUE_HIGH
        ),
        products=lambda ctx: ["LOAN_HOME_PROJECT"],
        evidence_fields=("valueScore", "leverage"),
    ),
    Rule(
        code="CONSUMER_LOAN_PROSPECT", priority=20, rec_type="cross_sell", severity="low",
        title="Khách hàng tài chính lành mạnh, chưa vay — giới thiệu Vay mua ô tô / xây sửa nhà / tiêu dùng",
        rationale="Không có dư nợ vay hiện tại và CASA vẫn ổn định/tăng: đủ điều kiện xem xét khoản vay tiêu dùng khi có nhu cầu.",
        condition=lambda ctx: bool(
            ctx.metrics.leverage == 0
            and not ctx.holds("LOAN_ADVANCE") and not ctx.holds("LOAN_OVERDRAFT")
            and not ctx.holds("LOAN_UNSECURED") and not ctx.holds("LOAN_MORTGAGE")
            and ctx.metrics.casaTrend >= 0 and ctx.metrics.freq90 > 0
        ),
        products=lambda ctx: ["LOAN_CONSUMER"],
        evidence_fields=("casaTrend", "freq90"),
    ),
    Rule(
        code="FAMILY_CARD_PROSPECT", priority=21, rec_type="cross_sell", severity="low",
        title="Hành vi chi tiêu gia đình — giới thiệu thẻ MSB Mastercard Family",
        rationale="Mô tả hành vi khách hàng có nhắc tới chi tiêu gia đình và chưa sở hữu thẻ tín dụng: phù hợp thẻ hoàn tiền chi tiêu gia đình.",
        condition=lambda ctx: "gia đình" in ctx.note and not ctx.holds("CREDIT_CARD"),
        products=lambda ctx: ["CARD_MC_FAMILY"],
        evidence_fields=(),
    ),
    Rule(
        code="STARTER_CARD_PROSPECT", priority=22, rec_type="cross_sell", severity="low",
        title="Khách hàng phổ thông chưa có thẻ — giới thiệu Thẻ đa năng MSB Mastercard Hybrid",
        rationale="Khách hàng phân khúc Mass giao dịch rất thường xuyên nhưng chưa sở hữu thẻ tín dụng: thẻ Hybrid (ghi nợ + tín dụng) phù hợp làm sản phẩm nhập môn.",
        condition=lambda ctx: bool(
            not ctx.holds("CREDIT_CARD") and ctx.metrics.tierLabel == "Mass"
            and ctx.metrics.freq90 >= STARTER_CARD_MIN_FREQ90 and "gia đình" not in ctx.note
        ),
        products=lambda ctx: ["CARD_MC_HYBRID"],
        evidence_fields=("freq90", "holdingCount"),
    ),
    Rule(
        code="PERIODIC_INCOME_FOR_LARGE_FD", priority=23, rec_type="deposit", severity="low",
        title="Đang có tiền gửi lớn, khẩu vị an toàn — giới thiệu Tiết kiệm định kỳ sinh lời",
        rationale="Khách hàng đang giữ tiền gửi có kỳ hạn, khẩu vị rủi ro An toàn và không ở gần sự kiện đáo hạn/tất toán: có thể quan tâm phương án nhận lãi định kỳ hằng tháng/quý thay vì cuối kỳ.",
        condition=lambda ctx: bool(
            ctx.metrics.amount("fdCurrent") > 0 and ctx.declared_risk_appetite == "An toàn" and not ctx.fd_event()
        ),
        products=lambda ctx: ["DEP_PERIODIC_INCOME"],
        evidence_fields=("fdCurrent", "riskAppetiteLabel"),
    ),
]

RULES_BY_CODE = {rule.code: rule for rule in RULES}


def evaluate(ctx: RuleContext, limit: int = MAX_RECOMMENDATIONS) -> list[RuleHit]:
    """Fires every matching rule in priority order, applies the no-new-loans block and caps the list."""
    fired = [rule for rule in RULES if rule.condition(ctx)]
    blocks_loans = any(rule.blocks_loans for rule in fired)
    used_products: set[str] = set()
    hits: list[RuleHit] = []
    for rule in fired:
        products = [product for pid in rule.products(ctx) if (product := find_product(pid))]
        if blocks_loans:
            products = [product for product in products if product.group != GROUP_LOAN]
        # A product already recommended by a higher-priority rule is not repeated.
        products = [product for product in products if product.product_id not in used_products]
        if not products and not rule.is_advisory:
            continue
        used_products.update(product.product_id for product in products[:1])
        evidence = [
            EvidenceItem(field_name, format_metric(ctx.metrics, field_name))
            for field_name in rule.evidence_fields
        ]
        if ctx.period:
            evidence += [
                EvidenceItem(field_name, format_period(ctx.period, field_name), source="period_summary")
                for field_name in rule.period_evidence
            ]
        hits.append(RuleHit(rule=rule, products=products, evidence=evidence))
    return hits[:limit]
