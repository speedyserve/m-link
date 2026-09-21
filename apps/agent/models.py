"""Pydantic models: the M-Link Application contract (request/response) and the Part B
metrics payload the Agent receives from the Application's internal API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MLinkAnalyzeRequest(BaseModel):
    """Stable request sent by the M-Link Application backend.

    `periodFrom`/`periodTo` carry the window the RM filtered in the UI. They are named this way
    (not `from`/`to`) because `from` is a Python keyword. When absent, the Agent analyses the
    Application's default 90-day snapshot.
    """

    customerId: str
    objective: str = "prepare_rm_brief"
    requestedBy: str
    locale: str = "vi"
    periodFrom: str | None = None
    periodTo: str | None = None


class CustomerMetrics(BaseModel):
    """Mirror of `customerMetricsSchema` in packages/contracts (computed by the Application)."""

    customerId: str
    asOfDate: str
    recencyDays: int
    freq90: int
    freqPrev90: int
    casaAvg90: str
    casaAvgPrev90: str
    casaTrend: float
    casaCv: float
    ccAvgBalance90: str
    creditLimit: str
    cur: float
    loanTotal: str
    fdCurrent: str
    fdAvgPrev90: str
    fdLiquidated: bool
    bondCurrent: str
    fundCertCurrent: str
    tav: str
    leverage: float
    phs: float
    holdingCount: int
    fxVolume12m: str
    rasRaw: float
    ras: float
    valueScore: float
    churnScore: float
    churnLabel: str
    crossSellScore: float
    priorityScore: float
    behaviourLabel: str
    riskAppetiteLabel: str
    tierLabel: str
    phsLabel: str
    suggestionCode: str
    isNewCif: bool = False
    computedAt: str = ""
    # Length of the aggregation window the Application used (90 by default, or the filtered period).
    windowDays: int = 90
    prevWindowDays: int = 90

    def amount(self, field: str) -> float:
        """Decimal strings (numeric(20,2)) as floats for arithmetic and formatting."""
        try:
            return float(getattr(self, field))
        except (TypeError, ValueError):
            return 0.0


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


class MLinkPeriod(BaseModel):
    """The analysed window, echoed back to the Application. Serialise with `by_alias=True`."""

    model_config = ConfigDict(populate_by_name=True)

    from_date: str = Field(alias="from")
    to: str
    windowDays: int


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
    period: MLinkPeriod | None = None
