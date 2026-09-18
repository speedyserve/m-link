from conftest import make_context, make_metrics, make_period_summary

from knowledge_base import GROUP_LOAN, find_product
from rules import RULES, PeriodFacts, RuleContext, evaluate


def _ctx(context):
    return RuleContext(metrics=context.metrics, holdings=context.holdings, next_best_offers=context.next_best_offers,
                       customer=context.customer, deposits=context.deposits,
                       period=PeriodFacts.from_summary(context.period_summary))


def codes(hits):
    return [hit.rule.code for hit in hits]


def test_rule_priorities_are_unique_and_ordered():
    priorities = [rule.priority for rule in RULES]
    assert priorities == sorted(priorities) and len(set(priorities)) == len(priorities)


def test_every_rule_product_exists_in_catalogue():
    ctx = _ctx(make_context(make_metrics(), customer={"declaredRiskAppetite": "An toàn"}))
    for rule in RULES:
        for pid in rule.products(ctx):
            assert find_product(pid) is not None, f"{rule.code} references unknown product {pid}"


def test_maintain_customer_fires_no_rule():
    assert evaluate(_ctx(make_context(make_metrics()))) == []


def test_leverage_high_blocks_loan_products_of_other_rules():
    ctx = _ctx(make_context(make_metrics(leverage=1.75, casaCv=0.35), holdings={"LOAN_UNSECURED": True}))
    hits = evaluate(ctx)
    assert codes(hits)[0] == "LEVERAGE_HIGH"
    assert hits[0].primary_product.product_id == "BANCA_PRU_PROTECT"
    # BUSINESS_CASHFLOW_VOLATILE would fire (CV > 0.2 + unsecured loan) but only offers loans.
    assert "BUSINESS_CASHFLOW_VOLATILE" not in codes(hits)
    assert all(product.group != GROUP_LOAN for hit in hits for product in hit.products)


def test_cur_high_uses_green_world_installments():
    hits = evaluate(_ctx(make_context(make_metrics(cur=0.85, creditLimit="100000000.00"))))
    assert codes(hits) == ["CUR_HIGH"]
    assert hits[0].primary_product.product_id == "CARD_MC_GREEN_WORLD"


def test_churn_high_is_retention_with_priority_deposit_offer():
    hits = evaluate(_ctx(make_context(make_metrics(churnScore=63.67, churnLabel="Cao", recencyDays=229))))
    assert codes(hits)[0] == "CHURN_HIGH"
    assert hits[0].rule.rec_type == "retention"
    assert hits[0].primary_product.product_id == "DEP_ONLINE"


def test_risk_mismatch_is_advisory_without_product():
    ctx = _ctx(make_context(make_metrics(rasRaw=0.8, ras=0.8), customer={"declaredRiskAppetite": "An toàn"}))
    hits = evaluate(ctx)
    assert "RISK_MISMATCH" in codes(hits)
    hit = next(h for h in hits if h.rule.code == "RISK_MISMATCH")
    assert hit.products == [] and hit.rule.is_advisory


def test_risk_mismatch_does_not_fire_for_declared_high_appetite():
    ctx = _ctx(make_context(make_metrics(rasRaw=0.8, ras=0.8), customer={"declaredRiskAppetite": "Rủi ro cao"}))
    assert "RISK_MISMATCH" not in codes(evaluate(ctx))


def test_fd_event_negative_trend_retains_before_cross_sell():
    hits = evaluate(_ctx(make_context(make_metrics(fdLiquidated=True, casaTrend=-0.2))))
    hit = next(h for h in hits if h.rule.code == "FD_EVENT")
    assert hit.primary_product.product_id == "DEP_ONLINE"


def test_fd_event_positive_trend_renews_longer_or_moves_to_cd():
    deposits = [{"status": "ACTIVE", "maturityDate": "2026-10-01"}]
    hits = evaluate(_ctx(make_context(make_metrics(casaTrend=0.02), deposits=deposits)))
    hit = next(h for h in hits if h.rule.code == "FD_EVENT")
    assert [p.product_id for p in hit.products] == ["DEP_HIGHEST_RATE", "CD_MSB"]


def test_fd_maturity_outside_window_does_not_fire():
    deposits = [{"status": "ACTIVE", "maturityDate": "2026-12-01"}]
    assert "FD_EVENT" not in codes(evaluate(_ctx(make_context(make_metrics(), deposits=deposits))))


def test_under_penetrated_uses_next_best_offer_rank_order():
    ctx = _ctx(make_context(make_metrics(phs=0.15, valueScore=80), nbo={"CREDIT_CARD": 3, "BANCA": None, "FX": 1, "BOND": 2, "LOAN": None}))
    hit = next(h for h in evaluate(ctx) if h.rule.code == "UNDER_PENETRATED")
    assert hit.primary_product.product_id == "FX_SWIFT_PACKAGE"


def test_casa_surge_without_bond_offers_cd_and_unit_linked_for_balanced_appetite():
    hits = evaluate(_ctx(make_context(make_metrics(casaTrend=0.16, riskAppetiteLabel="Cân bằng"))))
    hit = next(h for h in hits if h.rule.code == "CASA_SURGE_NO_BOND")
    assert [p.product_id for p in hit.products] == ["CD_MSB", "BANCA_PRU_INVEST"]


def test_casa_surge_with_bond_held_does_not_fire():
    hits = evaluate(_ctx(make_context(make_metrics(casaTrend=0.16), holdings={"BOND": True})))
    assert "CASA_SURGE_NO_BOND" not in codes(hits)


def test_new_cif_onboarding_bundle():
    hits = evaluate(_ctx(make_context(make_metrics(isNewCif=True, casaTrend=0.08))))
    hit = next(h for h in hits if h.rule.code == "NEW_CIF_ONBOARDING")
    assert hit.primary_product.product_id == "ACC_NICE_NUMBER"


def test_business_cashflow_rule_needs_business_signal():
    assert "BUSINESS_CASHFLOW_VOLATILE" not in codes(evaluate(_ctx(make_context(make_metrics(casaCv=0.3)))))
    ctx = _ctx(make_context(make_metrics(casaCv=0.3), customer={"behaviourNote": "Chủ hộ kinh doanh"}))
    assert "BUSINESS_CASHFLOW_VOLATILE" in codes(evaluate(ctx))


def test_fx_active_requires_volume_and_high_ras():
    assert "FX_ACTIVE" in codes(evaluate(_ctx(make_context(make_metrics(fxVolume12m="5000000000.00", ras=0.8, rasRaw=2.3)))))
    assert "FX_ACTIVE" not in codes(evaluate(_ctx(make_context(make_metrics(fxVolume12m="5000000000.00", ras=0.1)))))


def test_dormant_reactivation():
    hits = evaluate(_ctx(make_context(make_metrics(recencyDays=120))))
    assert "DORMANT" in codes(hits)


def test_evaluate_caps_at_three_hits_in_priority_order():
    ctx = _ctx(make_context(
        make_metrics(leverage=0.9, cur=0.9, churnScore=70, churnLabel="Cao", recencyDays=200, rasRaw=0.9, ras=0.9),
        customer={"declaredRiskAppetite": "An toàn"},
    ))
    hits = evaluate(ctx)
    assert codes(hits) == ["LEVERAGE_HIGH", "CUR_HIGH", "CHURN_HIGH"]


def test_lower_priority_rules_do_not_repeat_a_product():
    # CHURN_HIGH takes DEP_ONLINE; FD_EVENT (negative trend) must fall through to its alternative.
    hits = evaluate(_ctx(make_context(make_metrics(churnScore=63.67, churnLabel="Cao", recencyDays=229, fdLiquidated=True, casaTrend=-0.12))))
    assert codes(hits)[:2] == ["CHURN_HIGH", "FD_EVENT"]
    assert hits[0].primary_product.product_id == "DEP_ONLINE"
    assert hits[1].primary_product.product_id == "DEP_HIGHEST_RATE"
    primaries = [hit.primary_product.product_id for hit in hits if hit.primary_product]
    assert len(primaries) == len(set(primaries))


# ── Period rules (extension beyond the docx matrix) ──────────────

def test_period_rules_never_fire_without_a_period():
    ctx = _ctx(make_context(make_metrics(creditLimit="100000000.00", cur=0.1)))
    assert ctx.period is None
    assert not [code for code in codes(evaluate(ctx)) if code.endswith("_IN_PERIOD")]


def test_inactive_in_period_fires_on_a_window_without_any_activity():
    ctx = _ctx(make_context(make_metrics(), period_summary=make_period_summary(active_days=0, txn_count=0)))
    hits = evaluate(ctx)
    assert "INACTIVE_IN_PERIOD" in codes(hits)
    hit = next(h for h in hits if h.rule.code == "INACTIVE_IN_PERIOD")
    assert hit.primary_product.product_id == "APP_REACTIVATION"
    assert [item.source for item in hit.evidence if item.field == "activeDays"] == ["period_summary"]


def test_inactive_in_period_ignores_windows_shorter_than_a_month():
    ctx = _ctx(make_context(make_metrics(), period_summary=make_period_summary(days=7, active_days=0, txn_count=0)))
    assert "INACTIVE_IN_PERIOD" not in codes(evaluate(ctx))


def test_dormant_takes_precedence_and_keeps_the_reactivation_product_once():
    ctx = _ctx(make_context(make_metrics(recencyDays=120), period_summary=make_period_summary(active_days=0, txn_count=0)))
    hits = evaluate(ctx)
    assert codes(hits)[0] == "DORMANT"
    assert "INACTIVE_IN_PERIOD" not in codes(hits)   # same product, deduped


def test_casa_drop_in_period_fires_on_a_twenty_percent_fall():
    ctx = _ctx(make_context(make_metrics(), period_summary=make_period_summary(casa_start=100_000_000, casa_end=75_000_000)))
    hits = evaluate(ctx)
    hit = next(h for h in hits if h.rule.code == "CASA_DROP_IN_PERIOD")
    assert hit.rule.rec_type == "retention"
    assert hit.primary_product.product_id == "DEP_ONLINE"
    assert any(item.field == "casaChange" and item.value.startswith("-") for item in hit.evidence)


def test_casa_drop_in_period_ignores_a_mild_fall():
    ctx = _ctx(make_context(make_metrics(), period_summary=make_period_summary(casa_start=100_000_000, casa_end=95_000_000)))
    assert "CASA_DROP_IN_PERIOD" not in codes(evaluate(ctx))


def test_card_spend_high_in_period_offers_an_upgrade_when_utilisation_is_safe():
    ctx = _ctx(make_context(
        make_metrics(creditLimit="100000000.00", cur=0.2),
        period_summary=make_period_summary(card_spend=60_000_000, card_spend_days=18),
    ))
    hits = evaluate(ctx)
    hit = next(h for h in hits if h.rule.code == "CARD_SPEND_HIGH_IN_PERIOD")
    assert hit.primary_product.product_id == "CARD_VISA_SIGNATURE"


def test_card_spend_high_in_period_does_not_fire_when_utilisation_is_already_high():
    ctx = _ctx(make_context(
        make_metrics(creditLimit="100000000.00", cur=0.9),
        period_summary=make_period_summary(card_spend=60_000_000, card_spend_days=18),
    ))
    assert "CARD_SPEND_HIGH_IN_PERIOD" not in codes(evaluate(ctx))


def test_leverage_block_still_applies_to_period_rules():
    ctx = _ctx(make_context(
        make_metrics(leverage=1.2, creditLimit="100000000.00", cur=0.2),
        period_summary=make_period_summary(casa_start=100_000_000, casa_end=70_000_000),
    ))
    hits = evaluate(ctx)
    assert codes(hits)[0] == "LEVERAGE_HIGH"
    assert all(product.group != GROUP_LOAN for hit in hits for product in hit.products)


def test_card_spend_high_in_period_needs_a_month_of_data():
    """A one-week spike must not be extrapolated into a card upgrade."""
    ctx = _ctx(make_context(
        make_metrics(creditLimit="100000000.00", cur=0.2),
        period_summary=make_period_summary(days=7, active_days=6, card_spend=47_000_000, card_spend_days=3),
    ))
    assert "CARD_SPEND_HIGH_IN_PERIOD" not in codes(evaluate(ctx))
