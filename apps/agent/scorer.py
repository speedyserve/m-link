SIGNAL_WEIGHTS: dict[str, float] = {
    "fd_maturity": 1.0,
    "fd_early_withdrawal": 1.0,
    "large_outflow": 1.0,
    "late_payment": 0.8,
    "service_issue": 0.8,
    "idle_cash": 0.6,
    "coupon_due": 0.6,
    "cross_sell": 0.4,
}


def get_time_urgency(day_s_to_event: int | None) -> float:
    if day_s_to_event is None:
        return 0.1
    if day_s_to_event <= 3:
        return 1.0
    elif day_s_to_event <= 7:
        return 0.8
    elif day_s_to_event <= 15:
        return 0.5
    elif day_s_to_event <= 30:
        return 0.3
    else:
        return 0.1


def get_opportunity_value(amount_vnd: int | None) -> float:
    if amount_vnd is None:
        return 0.1
    if amount_vnd >= 1_000_000_000:
        return 1.0
    elif amount_vnd >= 500_000_000:
        return 0.8
    elif amount_vnd >= 200_000_000:
        return 0.6
    elif amount_vnd >= 50_000_000:
        return 0.4
    else:
        return 0.2


def calculate_priority_score(
    signal_type: str,
    days_to_event: int | None,
    amount_vnd: int | None,
) -> int:
    signal_weight = SIGNAL_WEIGHTS.get(signal_type, 0.1)
    time_urgency = get_time_urgency(days_to_event)
    opportunity_value = get_opportunity_value(amount_vnd)

    raw_score = (signal_weight * 40) + (time_urgency * 35) + (opportunity_value * 25)
    return min(100, max(0, round(raw_score)))


def get_heat_level(priority_score: int) -> str:
    if priority_score >= 80:
        return "high"
    elif priority_score >= 55:
        return "medium"
    else:
        return "low"


def get_score_breakdown(signal_type: str, days_to_event: int | None, amount_vnd: int | None) -> dict:
    return {
        "signal_weight": SIGNAL_WEIGHTS.get(signal_type, 0.1),
        "time_urgency": get_time_urgency(days_to_event),
        "opportunity_value": get_opportunity_value(amount_vnd),
    }