from models import CustomerDataInput


def _get_value(item, key: str, default=None):
    """Read a field from either a Pydantic model or a plain dictionary."""
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def extract_signals(data: CustomerDataInput) -> list[dict]:
    signals = []
    products = data.products
    as_of_date = data.as_of_date

    if products.casa:
        casa_signals = _extract_casa_signals(products.casa)
        signals.extend(casa_signals)

    if products.fixed_deposit:
        fd_signals = _extract_fd_signals(products.fixed_deposit)
        signals.extend(fd_signals)

    if products.bond:
        bond_signals = _extract_bond_signals(products.bond)
        signals.extend(bond_signals)

    if products.credit_card:
        cc_signals = _extract_credit_card_signals(products.credit_card)
        signals.extend(cc_signals)

    if products.vas:
        vas_signals = _extract_vas_signals(products.vas)
        signals.extend(vas_signals)

    return signals


def _extract_casa_signals(casa) -> list[dict]:
    signals = []
    inflow = casa.recent_inflow
    if inflow and isinstance(inflow, dict):
        amount = inflow.get("amount_vnd", 0)
        days_idle = inflow.get("days_idle", 0)
        if amount >= 50_000_000 and days_idle >= 7:
            signals.append({
                "product_group": "CASA",
                "observed_behavior": (
                    f"Dòng tiền {amount:,} VNĐ về tài khoản thanh toán "
                    f"từ ngày {inflow.get('received_date', '')}, "
                    f"đã để nhàn rỗi {days_idle} ngày chưa chuyển sang sản phẩm sinh lời."
                ).replace(",", "."),
                "classification": "neutral",
                "is_mapped": True,
                "signal_type": "idle_cash",
                "source_reference": inflow.get("transaction_code"),
                "days_to_event": None,
                "amount_vnd": amount,
                "keywords": ["dòng tiền nhàn rỗi", "casa sinh lời", "tài chính linh hoạt", "lãi suất bậc thang"],
                "product_id": "CASA_BOOST",
                "next_best_action": {
                    "product_name": "Tài khoản sinh lời tự động M-Pro Business / CASA Boost",
                    "action": (
                        "Tư vấn đăng ký CASA Boost để toàn bộ số dư vượt 10 triệu VNĐ "
                        "tự động sinh lời 3.6–4.0%/năm theo ngày, không ảnh hưởng khả năng thanh toán."
                    ),
                    "rationale": (
                        "Khách để tiền nhàn rỗi nhiều ngày không sinh lời, "
                        "phù hợp với trigger CASA Boost dành cho hộ kinh doanh có dòng tiền luân chuyển lớn."
                    ),
                    "deadline_hint": "càng sớm càng tốt, tránh mất thêm ngày không sinh lời",
                },
            })
    return signals


def _extract_fd_signals(fds: list) -> list[dict]:
    signals = []
    for fd in fds:
        days = _get_value(fd, "days_to_maturity", 999)
        principal = _get_value(fd, "principal_vnd", 0)
        auto = _get_value(fd, "auto_rollover", True)

        if days <= 7 and not auto and principal >= 50_000_000:
            signals.append({
                "product_group": "FD",
                "observed_behavior": (
                    f"Sổ tiết kiệm {_get_value(fd, 'account_ref', '')} trị giá {principal:,} VNĐ "
                    f"kỳ hạn {_get_value(fd, 'term_months', '')} tháng sắp đáo hạn ngày {_get_value(fd, 'maturity_date', '')}, "
                    f"còn {days} ngày, chưa đăng ký tự động tái tục."
                ).replace(",", "."),
                "classification": "positive",
                "is_mapped": True,
                "signal_type": "fd_maturity",
                "source_reference": _get_value(fd, "account_ref", None),
                "days_to_event": days,
                "amount_vnd": principal,
                "keywords": ["đáo hạn tiết kiệm", "tái tục", "chứng chỉ tiền gửi", "lãi suất ưu đãi", "35 năm MSB"],
                "product_id": "CD_35NAM",
                "next_best_action": {
                    "product_name": "Chứng chỉ tiền gửi Linh hoạt 35 Năm MSB",
                    "action": (
                        "Gọi điện tư vấn tái tục sang Chứng chỉ tiền gửi 35 năm để hưởng "
                        "lãi suất 6.2–6.8%/năm cộng thêm 0.35% ưu đãi."
                    ),
                    "rationale": (
                        "Sổ đáo hạn trong ít ngày, chưa tái tục tự động, "
                        "lãi suất CCCD 35 năm cao hơn gửi tiết kiệm thông thường "
                        "và cho phép rút linh hoạt từng phần."
                    ),
                    "deadline_hint": f"trước ngày {_get_value(fd, 'maturity_date', '')}",
                },
            })
    return signals


def _extract_bond_signals(bonds: list) -> list[dict]:
    signals = []
    for bond in bonds:
        days = _get_value(bond, "days_to_coupon", 999)
        value = _get_value(bond, "holding_value_vnd", 0)
        if days <= 30 and value >= 50_000_000:
            signals.append({
                "product_group": "BOND",
                "observed_behavior": (
                    f"Nắm giữ trái phiếu {_get_value(bond, 'issuer_type', '')} trị giá {value:,} VNĐ, "
                    f"sắp đến kỳ nhận coupon vào ngày {_get_value(bond, 'next_coupon_date', '')}, "
                    f"còn {days} ngày."
                ).replace(",", "."),
                "classification": "neutral",
                "is_mapped": True,
                "signal_type": "coupon_due",
                "source_reference": _get_value(bond, "account_ref", None),
                "days_to_event": days,
                "amount_vnd": value,
                "keywords": ["trái phiếu", "coupon", "tái đầu tư", "dòng tiền về", "sinh lời"],
                "product_id": "CASA_BOOST",
                "next_best_action": {
                    "product_name": "Tài khoản sinh lời tự động M-Pro Business / CASA Boost",
                    "action": (
                        "Chuẩn bị phương án đón dòng tiền coupon về, tư vấn kích hoạt "
                        "CASA Boost để tiền coupon tự động sinh lời ngay khi về tài khoản."
                    ),
                    "rationale": (
                        "Dòng tiền coupon sắp về, nếu để trong CASA thường sẽ không sinh lời; "
                        "CASA Boost giúp sinh lời 3.6–4.0%/năm mà vẫn rút ra linh hoạt khi cần."
                    ),
                    "deadline_hint": f"trước ngày {_get_value(bond, 'next_coupon_date', '')}",
                },
            })
    return signals


def _extract_credit_card_signals(cc) -> list[dict]:
    signals = []
    if not cc:
        return signals

    categories = cc.top_spending_categories or []
    payment = cc.payment_history
    dining_share = 0.0
    for cat in categories:
        share = cat.get("share", 0) if isinstance(cat, dict) else getattr(cat, "share", 0)
        cat_name = cat.get("category", "") if isinstance(cat, dict) else getattr(cat, "category", "")
        if "ẩm thực" in cat_name.lower() or "am thuc" in cat_name.lower():
            dining_share = share
            break

    late_count = 0
    full_payment = 0.0
    if payment:
        if isinstance(payment, dict):
            late_count = payment.get("late_payment_count_12m", 0)
            full_payment = payment.get("full_payment_rate", 0)
        else:
            late_count = getattr(payment, "late_payment_count_12m", 0)
            full_payment = getattr(payment, "full_payment_rate", 0)

    if dining_share >= 0.40 and late_count == 0 and full_payment >= 1.0:
        signals.append({
            "product_group": "CREDIT_CARD",
            "observed_behavior": (
                f"Chi tiêu thẻ đều đặn {cc.average_monthly_spend_vnd:,} VNĐ/tháng, "
                f"ẩm thực chiếm {int(dining_share * 100)}% tổng chi tiêu, "
                f"100% thanh toán sao kê đúng hạn và đủ, "
                f"không có lần trễ hạn nào trong 12 tháng."
            ).replace(",", "."),
            "classification": "positive",
            "is_mapped": True,
            "signal_type": "cross_sell",
            "source_reference": None,
            "days_to_event": None,
            "amount_vnd": cc.average_monthly_spend_vnd,
            "keywords": ["tín dụng", "hoàn tiền ẩm thực", "Visa Signature", "phong cách sống", "nâng hạng thẻ"],
            "product_id": "VISA_SIGNATURE",
            "next_best_action": {
                "product_name": "Thẻ tín dụng MSB Visa Signature / MSB Cashback Card",
                "action": (
                    "Tư vấn nâng hạng lên MSB Visa Signature để nhận hoàn tiền 10% cho ẩm thực, "
                    "tối đa 1 triệu VNĐ/tháng, và bảo hiểm du lịch toàn cầu 10,5 tỷ."
                ),
                "rationale": (
                    "Tỷ trọng chi tiêu ẩm thực vượt ngưỡng trigger 40%, "
                    "lịch sử thanh toán hoàn hảo, phù hợp nâng hạng thẻ tối ưu hoàn tiền."
                ),
                "deadline_hint": "trong tháng, tận dụng chi tiêu cuối năm",
            },
        })

    return signals


def _extract_vas_signals(vas) -> list[dict]:
    signals = []
    if not vas:
        return signals

    method = vas.utility_payment_method if hasattr(vas, "utility_payment_method") else vas.get("utility_payment_method", "")
    auto = vas.auto_debit_enabled if hasattr(vas, "auto_debit_enabled") else vas.get("auto_debit_enabled", False)
    incidents = vas.late_payment_incidents_12m if hasattr(vas, "late_payment_incidents_12m") else vas.get("late_payment_incidents_12m", 0)

    is_manual = "thủ công" in str(method).lower() or "manual" in str(method).lower()

    if is_manual and not auto:
        classification = "negative" if incidents >= 1 else "neutral"
        signals.append({
            "product_group": "VAS",
            "observed_behavior": (
                f"Khách hàng thanh toán hóa đơn điện nước thủ công, "
                f"chưa bật trích nợ tự động, "
                f"từng có {incidents} lần trễ hạn trong 12 tháng gần nhất."
            ),
            "classification": "negative" if incidents >= 1 else "neutral",
            "is_mapped": True,
            "signal_type": "late_payment" if incidents >= 1 else "cross_sell",
            "source_reference": None,
            "days_to_event": None,
            "amount_vnd": None if incidents == 0 else 10_000_000,
            "keywords": [
                "thanh toán điện nước", "chuyển đổi số",
                "auto-debit", "hoàn tiền hóa đơn", "tiện ích"
            ],
            "product_id": "AUTO_DEBIT",
            "next_best_action": {
                "product_name": "Tiện ích MSB Auto-Debit Utility",
                "action": (
                    "Đăng ký trích nợ tự động hóa đơn điện nước, viễn thông để tránh trễ hạn, "
                    "miễn phí trọn đời và hoàn tiền 5% trong 3 tháng đầu."
                ),
                "rationale": (
                    "Khách từng trễ hạn, thanh toán thủ công dễ bỏ sót; "
                    "Auto-Debit giúp tự động hóa, tránh gián đoạn dịch vụ và có hoàn tiền kích cầu."
                ),
                "deadline_hint": "trước kỳ thanh toán cuối tháng",
            },
        })

    return signals


def extract_timeline(data: CustomerDataInput, as_of_date: str) -> list[dict]:
    events = []
    products = data.products

    if products.casa and products.casa.recent_inflow:
        inflow = products.casa.recent_inflow
        if isinstance(inflow, dict):
            received_date = inflow.get("received_date", "")
            amount = inflow.get("amount_vnd", 0)
            if received_date and amount:
                events.append({
                    "date": received_date,
                    "event": f"Dòng tiền {amount:,} VNĐ về tài khoản thanh toán CASA".replace(",", "."),
                    "impact": "neutral",
                    "amount_vnd": amount,
                })

    if as_of_date:
        events.append({
            "date": as_of_date,
            "event": "Ngày phân tích – phát hiện các tín hiệu cơ hội và rủi ro từ dữ liệu khách hàng",
            "impact": "neutral",
            "amount_vnd": None,
        })

    for fd in (products.fixed_deposit or []):
        maturity_date = _get_value(fd, "maturity_date", "")
        principal = _get_value(fd, "principal_vnd", 0)
        if maturity_date and principal:
            events.append({
                "date": maturity_date,
                "event": (
                    f"Sổ tiết kiệm {_get_value(fd, 'account_ref', '')} {principal:,} VNĐ đáo hạn, "
                    f"{'đã' if _get_value(fd, 'auto_rollover', False) else 'chưa'} đăng ký tái tục tự động"
                ).replace(",", "."),
                "impact": "positive",
                "amount_vnd": principal,
            })

    for bond in (products.bond or []):
        coupon_date = _get_value(bond, "next_coupon_date", "")
        if coupon_date:
            events.append({
                "date": coupon_date,
                "event": f"Trái phiếu {_get_value(bond, 'issuer_type', '')} đến kỳ nhận coupon",
                "impact": "neutral",
                "amount_vnd": None,
            })

    events.sort(key=lambda e: e["date"])
    return events
