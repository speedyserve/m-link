from pydantic import BaseModel, Field


class CASAInput(BaseModel):
    average_balance_vnd: int = 0
    average_balance_range_vnd: list[int] = []
    recent_inflow: dict | None = None


class FixedDepositInput(BaseModel):
    account_ref: str
    principal_vnd: int
    term_months: int
    maturity_date: str
    days_to_maturity: int
    auto_rollover: bool = False


class BondInput(BaseModel):
    issuer_type: str
    holding_value_vnd: int
    next_coupon_date: str
    days_to_coupon: int


class SpendingCategory(BaseModel):
    category: str
    share: float


class PaymentHistory(BaseModel):
    full_payment_rate: float
    late_payment_count_12m: int


class CreditCardInput(BaseModel):
    credit_limit_vnd: int
    average_monthly_spend_vnd: int
    utilization_rate: float
    top_spending_categories: list[SpendingCategory] = []
    payment_history: PaymentHistory | None = None


class VASInput(BaseModel):
    utility_payment_method: str = ""
    auto_debit_enabled: bool = False
    late_payment_incidents_12m: int = 0
    mobile_topup_frequency: str = ""


class ProductsInput(BaseModel):
    casa: CASAInput | None = None
    fixed_deposit: list[FixedDepositInput] = []
    bond: list[BondInput] = []
    credit_card: CreditCardInput | None = None
    vas: VASInput | None = None


class CustomerDataInput(BaseModel):
    cif: str
    customer_name: str
    segment: str = ""
    as_of_date: str = ""
    # Optional so the engine can return a structured `insufficient_data`
    # response instead of rejecting the whole request during validation.
    products: ProductsInput | None = None


class AnalysisRequest(BaseModel):
    customer_data: CustomerDataInput


class MLinkAnalyzeRequest(BaseModel):
    """Stable request sent by the M-Link Application backend."""

    customerId: str
    objective: str = "prepare_rm_brief"
    requestedBy: str
    locale: str = "vi"


class ScoreBreakdown(BaseModel):
    signal_weight: float
    time_urgency: float
    opportunity_value: float


class NextBestAction(BaseModel):
    product_name: str
    action: str
    rationale: str
    deadline_hint: str


class Signal(BaseModel):
    product_group: str
    observed_behavior: str
    classification: str
    priority_score: int
    score_breakdown: ScoreBreakdown
    heat_level: str
    keywords: list[str]
    is_mapped: bool
    signal_type: str = "unknown"
    product_id: str | None = None
    source_reference: str | None = None
    next_best_action: NextBestAction


class TimelineEvent(BaseModel):
    date: str
    event: str
    impact: str
    amount_vnd: int | None = None


class MainPoint(BaseModel):
    order: int
    title: str
    talking_point: str
    expected_objection: str
    objection_response: str


class ConsultationScript(BaseModel):
    opening: str
    main_points: list[MainPoint]
    closing: str


class CustomerMessage(BaseModel):
    sms: str
    zalo: str


class CustomerSummary(BaseModel):
    name: str
    segment: str
    total_relationship_value_vnd: int
    engagement_level: str
    headline: str


class AnalysisOutput(BaseModel):
    status: str
    cif: str
    customer_summary: CustomerSummary | None = None
    signals: list[Signal] = []
    timeline_trend: list[TimelineEvent] = []
    consultation_script: ConsultationScript | None = None
    customer_message: CustomerMessage | None = None
    compliance_note: str = ""
    data_gaps: list[str] = []


class MLinkSummary(BaseModel):
    relationshipStatus: str
    opportunityScore: float = Field(ge=0, le=100)
    overview: str


class MLinkSignal(BaseModel):
    type: str
    title: str
    severity: str
    confidence: float = Field(ge=0, le=1)
    description: str


class MLinkEvidence(BaseModel):
    type: str
    title: str
    description: str
    source: str | None = None
    sourceReference: str | None = None


class MLinkProduct(BaseModel):
    id: str
    name: str


class MLinkRecommendation(BaseModel):
    priority: int = Field(ge=1)
    type: str
    title: str
    description: str = ""
    confidence: float = Field(ge=0, le=1)
    product: MLinkProduct | None = None
    reasons: list[str] = []
    evidence: list[MLinkEvidence] = []
    script: str = ""


class MLinkGuardrail(BaseModel):
    sellAllowed: bool
    reason: str | None = None


class MLinkAnalysisResponse(BaseModel):
    runId: str
    customerId: str
    summary: MLinkSummary
    signals: list[MLinkSignal] = []
    recommendations: list[MLinkRecommendation] = []
    guardrail: MLinkGuardrail
