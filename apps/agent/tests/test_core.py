"""Tests for M-Link Agent core modules."""

import pytest
from datetime import date

from scorer import (
    calculate_priority_score,
    get_heat_level,
    get_time_urgency,
    get_opportunity_value,
    get_score_breakdown,
)
from signal_extractor import extract_signals, extract_timeline
from knowledge_base import (
    find_products_by_group,
    find_product_by_id,
    match_product_for_signal,
    PRODUCT_KNOWLEDGE_BASE,
)
from engine import analyze
from models import CustomerDataInput, ProductsInput, CASAInput, FixedDepositInput, BondInput, CreditCardInput, VASInput, SpendingCategory, PaymentHistory


# ── Scorer tests ──────────────────────────────────────────

class TestScorer:
    def test_time_urgency_within_3_days(self):
        assert get_time_urgency(1) == 1.0
        assert get_time_urgency(3) == 1.0

    def test_time_urgency_4_to_7_days(self):
        assert get_time_urgency(4) == 0.8
        assert get_time_urgency(7) == 0.8

    def test_time_urgency_8_to_15_days(self):
        assert get_time_urgency(8) == 0.5
        assert get_time_urgency(15) == 0.5

    def test_time_urgency_16_to_30_days(self):
        assert get_time_urgency(16) == 0.3
        assert get_time_urgency(30) == 0.3

    def test_time_urgency_over_30_days(self):
        assert get_time_urgency(31) == 0.1
        assert get_time_urgency(100) == 0.1

    def test_time_urgency_none(self):
        assert get_time_urgency(None) == 0.1

    def test_opportunity_value_1b_plus(self):
        assert get_opportunity_value(1_000_000_000) == 1.0
        assert get_opportunity_value(2_000_000_000) == 1.0

    def test_opportunity_value_500m_to_1b(self):
        assert get_opportunity_value(500_000_000) == 0.8
        assert get_opportunity_value(999_999_999) == 0.8

    def test_opportunity_value_200m_to_500m(self):
        assert get_opportunity_value(200_000_000) == 0.6
        assert get_opportunity_value(499_999_999) == 0.6

    def test_opportunity_value_50m_to_200m(self):
        assert get_opportunity_value(50_000_000) == 0.4
        assert get_opportunity_value(199_999_999) == 0.4

    def test_opportunity_value_under_50m(self):
        assert get_opportunity_value(10_000_000) == 0.2
        assert get_opportunity_value(49_999_999) == 0.2

    def test_opportunity_value_none(self):
        assert get_opportunity_value(None) == 0.1

    def test_calculate_priority_score_fd_maturity_urgent(self):
        score = calculate_priority_score("fd_maturity", 5, 500_000_000)
        assert 80 <= score <= 100

    def test_calculate_priority_score_idle_cash(self):
        score = calculate_priority_score("idle_cash", None, 500_000_000)
        assert 40 <= score <= 70

    def test_calculate_priority_score_cross_sell(self):
        score = calculate_priority_score("cross_sell", None, 65_000_000)
        assert 20 <= score <= 50

    def test_heat_level_high(self):
        assert get_heat_level(85) == "high"
        assert get_heat_level(80) == "high"
        assert get_heat_level(100) == "high"

    def test_heat_level_medium(self):
        assert get_heat_level(55) == "medium"
        assert get_heat_level(79) == "medium"

    def test_heat_level_low(self):
        assert get_heat_level(0) == "low"
        assert get_heat_level(54) == "low"


# ── Knowledge Base tests ─────────────────────────────────

class TestKnowledgeBase:
    def test_all_four_products_present(self):
        assert len(PRODUCT_KNOWLEDGE_BASE) == 4

    def test_find_by_group_casa(self):
        products = find_products_by_group("CASA")
        assert len(products) == 1
        assert products[0].product_id == "CASA_BOOST"

    def test_find_by_group_fd(self):
        products = find_products_by_group("FD")
        assert len(products) == 1
        assert products[0].product_id == "CD_35NAM"

    def test_find_by_group_credit_card(self):
        products = find_products_by_group("CREDIT_CARD")
        assert len(products) == 1
        assert products[0].product_id == "VISA_SIGNATURE"

    def test_find_by_group_vas(self):
        products = find_products_by_group("VAS")
        assert len(products) == 1
        assert products[0].product_id == "AUTO_DEBIT"

    def test_find_by_group_unknown(self):
        products = find_products_by_group("LOAN")
        assert len(products) == 0

    def test_find_product_by_id(self):
        p = find_product_by_id("CD_35NAM")
        assert p is not None
        assert "6.2%" in p.interest_rate

    def test_find_product_by_id_none(self):
        assert find_product_by_id("NONEXISTENT") is None

    def test_match_product_for_signal(self):
        p = match_product_for_signal("FD")
        assert p is not None
        assert p.product_id == "CD_35NAM"

    def test_match_product_for_signal_unknown_group(self):
        p = match_product_for_signal("LOAN")
        assert p is None


# ── Signal Extraction tests ──────────────────────────────

def _make_customer_data(
    cif: str = "TEST001",
    name: str = "Test User",
    segment: str = "Khách hàng cá nhân",
    **overrides,
) -> CustomerDataInput:
    defaults = {
        "cif": cif,
        "customer_name": name,
        "segment": segment,
        "as_of_date": "2026-09-13",
        "products": ProductsInput(
            casa=CASAInput(
                average_balance_vnd=100_000_000,
                recent_inflow={
                    "amount_vnd": 200_000_000,
                    "received_date": "2026-09-01",
                    "days_idle": 12,
                },
            ),
            fixed_deposit=[
                FixedDepositInput(
                    account_ref="FD-TEST",
                    principal_vnd=300_000_000,
                    term_months=6,
                    maturity_date="2026-09-18",
                    days_to_maturity=5,
                    auto_rollover=False,
                )
            ],
            bond=[
                BondInput(
                    issuer_type="Trái phiếu doanh nghiệp",
                    holding_value_vnd=150_000_000,
                    next_coupon_date="2026-09-30",
                    days_to_coupon=17,
                )
            ],
            credit_card=CreditCardInput(
                credit_limit_vnd=80_000_000,
                average_monthly_spend_vnd=45_000_000,
                utilization_rate=0.56,
                top_spending_categories=[
                    SpendingCategory(category="Ẩm thực", share=0.50),
                    SpendingCategory(category="Siêu thị", share=0.30),
                    SpendingCategory(category="Khác", share=0.20),
                ],
                payment_history=PaymentHistory(
                    full_payment_rate=1.0,
                    late_payment_count_12m=0,
                ),
            ),
            vas=VASInput(
                utility_payment_method="Thủ công cuối tháng",
                auto_debit_enabled=False,
                late_payment_incidents_12m=1,
                mobile_topup_frequency="Thường xuyên",
            ),
        ),
    }
    defaults.update(overrides)
    return CustomerDataInput(**defaults)


class TestSignalExtraction:
    def test_extract_signals_full_profile(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        assert len(signals) >= 4

    def test_fd_maturity_signal(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        fd_signals = [s for s in signals if s["product_group"] == "FD"]
        assert len(fd_signals) == 1
        assert fd_signals[0]["classification"] == "positive"
        assert "đáo hạn" in fd_signals[0]["observed_behavior"].lower()
        assert fd_signals[0]["product_id"] == "CD_35NAM"

    def test_casa_idle_signal(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        casa_signals = [s for s in signals if s["product_group"] == "CASA"]
        assert len(casa_signals) == 1
        assert casa_signals[0]["classification"] == "neutral"
        assert casa_signals[0]["product_id"] == "CASA_BOOST"

    def test_bond_coupon_signal(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        bond_signals = [s for s in signals if s["product_group"] == "BOND"]
        assert len(bond_signals) == 1
        assert bond_signals[0]["classification"] == "neutral"
        assert "coupon" in bond_signals[0]["observed_behavior"].lower()

    def test_credit_card_signal(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        cc_signals = [s for s in signals if s["product_group"] == "CREDIT_CARD"]
        assert len(cc_signals) == 1
        assert cc_signals[0]["classification"] == "positive"
        assert cc_signals[0]["product_id"] == "VISA_SIGNATURE"

    def test_vas_signal_negative(self):
        data = _make_customer_data()
        signals = extract_signals(data)
        vas_signals = [s for s in signals if s["product_group"] == "VAS"]
        assert len(vas_signals) == 1
        assert vas_signals[0]["classification"] == "negative"
        assert vas_signals[0]["product_id"] == "AUTO_DEBIT"

    def test_no_signals_for_small_idle_cash(self):
        data = _make_customer_data()
        data.products.casa.recent_inflow = {
            "amount_vnd": 30_000_000,
            "received_date": "2026-09-01",
            "days_idle": 12,
        }
        signals = extract_signals(data)
        casa_signals = [s for s in signals if s["product_group"] == "CASA"]
        assert len(casa_signals) == 0

    def test_no_fd_signal_if_auto_rollover(self):
        data = _make_customer_data()
        data.products.fixed_deposit[0].auto_rollover = True
        signals = extract_signals(data)
        fd_signals = [s for s in signals if s["product_group"] == "FD"]
        assert len(fd_signals) == 0

    def test_no_cc_signal_if_dining_under_40pct(self):
        data = _make_customer_data()
        data.products.credit_card.top_spending_categories = [
            SpendingCategory(category="Ẩm thực", share=0.30),
            SpendingCategory(category="Siêu thị", share=0.50),
            SpendingCategory(category="Khác", share=0.20),
        ]
        signals = extract_signals(data)
        cc_signals = [s for s in signals if s["product_group"] == "CREDIT_CARD"]
        assert len(cc_signals) == 0

    def test_timeline_extraction(self):
        data = _make_customer_data()
        timeline = extract_timeline(data, data.as_of_date)
        assert len(timeline) >= 4


# ── Engine tests ─────────────────────────────────────────

class TestEngine:
    def test_full_analysis_le_polo(self):
        with open("sample_data/le_polo.json", "r", encoding="utf-8") as f:
            import json
            raw = json.load(f)

        customer_input = CustomerDataInput(**raw)
        result = analyze(customer_input)

        assert result.status == "success"
        assert result.cif == "POLO1988MSB"
        assert result.customer_summary is not None
        assert result.customer_summary.engagement_level == "high"
        assert result.customer_summary.total_relationship_value_vnd > 1_000_000_000
        assert len(result.signals) >= 4

        signals_by_priority = sorted(result.signals, key=lambda s: s.priority_score, reverse=True)
        assert signals_by_priority[0].product_group == "FD"
        assert signals_by_priority[0].heat_level == "high"
        assert signals_by_priority[0].priority_score >= 80

        for sig in result.signals:
            assert 0 <= sig.priority_score <= 100
            assert sig.heat_level in ("high", "medium", "low")
            assert len(sig.keywords) >= 3
            assert sig.next_best_action.product_name != ""

        assert len(result.timeline_trend) >= 3
        assert result.consultation_script is not None
        assert len(result.consultation_script.opening) > 0
        assert len(result.consultation_script.main_points) >= 1
        assert result.customer_message is not None
        assert len(result.customer_message.sms) <= 160
        assert len(result.customer_message.zalo) > 0
        assert len(result.compliance_note) > 0

    def test_insufficient_data_no_cif(self):
        data = CustomerDataInput(
            cif="",
            customer_name="",
            segment="",
            as_of_date="",
            products=ProductsInput(),
        )
        result = analyze(data)
        assert result.status == "insufficient_data"

    def test_insufficient_data_no_products(self):
        data = CustomerDataInput(
            cif="TEST001",
            customer_name="Test",
            segment="",
            as_of_date="",
            products=None,
        )
        result = analyze(data)
        assert result.status == "insufficient_data"


# ── Edge case tests ──────────────────────────────────────

class TestEdgeCases:
    def test_low_balance_customer(self):
        data = _make_customer_data()
        data.products.casa.average_balance_vnd = 8_000_000
        data.products.casa.recent_inflow = None
        data.products.fixed_deposit = []
        data.products.bond = []
        data.products.credit_card = None
        data.products.vas = None

        result = analyze(data)
        assert result.status == "success"
        assert result.customer_summary.engagement_level == "low"

    def test_negative_signals_prioritized(self):
        data = _make_customer_data()
        result = analyze(data)
        negative_signals = [s for s in result.signals if s.classification == "negative"]
        if negative_signals:
            for ns in negative_signals:
                assert ns.heat_level in ("medium", "high", "low")