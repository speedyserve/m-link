"""Part A of the MSB framework: retail product catalogue with reference rates and offers.

Source: msb.com.vn (Khách hàng cá nhân) as summarised in
"Khung_cong_thuc_danh_gia_KH_MSB.docx" on 18/09/2026. Rates and fees change by period;
the RB must check the current rate sheet and product page before quoting a customer.
"""

from __future__ import annotations

from dataclasses import dataclass, field

CATALOGUE_AS_OF = "2026-09-18"
M_FIRST_ONLINE_BONUS_PCT = 0.5   # extra %/year for priority customers depositing online
M_FIRST_BRANCH_BONUS_PCT = 0.2

GROUP_DEPOSIT = "DEPOSIT"
GROUP_ACCOUNT = "ACCOUNT"
GROUP_CARD = "CARD"
GROUP_LOAN = "LOAN"
GROUP_BANCA = "BANCA"
GROUP_FX = "FX"
GROUP_INVEST = "INVEST"
GROUP_SERVICE = "SERVICE"


@dataclass(frozen=True)
class Product:
    product_id: str
    name: str
    group: str
    summary: str
    rate_or_fee: str
    eligibility: str = ""
    talking_points: list[str] = field(default_factory=list)


PRODUCT_CATALOGUE: list[Product] = [
    # A.1 Deposits
    Product("DEP_HIGHEST_RATE", "Tiết kiệm lãi suất cao nhất", GROUP_DEPOSIT,
            "Kỳ hạn 1–36 tháng, VND/USD, tối thiểu 500.000 VND, trả lãi cuối kỳ.",
            "Kỳ hạn 12 tháng ~5,3%/năm tại quầy (tham khảo).",
            talking_points=["Kỳ hạn dài hơn hưởng lãi cao hơn", "Rút trước hạn hưởng lãi không kỳ hạn"]),
    Product("DEP_ONLINE", "Tiền gửi có kỳ hạn trực tuyến", GROUP_DEPOSIT,
            "Mở và tất toán ngay trên App MSB Digital Bank.",
            "Cao hơn tới 0,5%/năm so với gửi tại quầy; KHƯT (M First) cộng thêm 0,5%/năm.",
            talking_points=["Không cần ra quầy", "Ưu đãi lãi suất cho khách hàng ưu tiên"]),
    # "~5,3%/năm kỳ hạn 12 tháng tại quầy" là mức tham khảo công bố của MSB, dùng chung với
    # DEP_HIGHEST_RATE ở trên — workbook không có bảng lãi suất riêng cho từng sản phẩm.
    Product("DEP_PERIODIC_INCOME", "Tiết kiệm M Sinh Lời (định kỳ)", GROUP_DEPOSIT,
            "Nhận lãi định kỳ hằng tháng/quý thay vì cuối kỳ.", "Lãi suất tương đương gửi thường, ~5,3%/năm kỳ hạn 12 tháng (tham khảo); được mở thấu chi ưu đãi."),
    Product("DEP_UPFRONT_INTEREST", "Tiết kiệm trả lãi ngay", GROUP_DEPOSIT,
            "Nhận lãi ngay khi gửi, kỳ hạn 1–36 tháng.", "Lãi suất thấp hơn gửi thường một chút do nhận lãi trước, tham khảo quanh 5%/năm kỳ hạn 12 tháng; có thể cầm cố sổ vay ưu đãi."),
    Product("DEP_PARTIAL_WITHDRAWAL", "Tiết kiệm rút gốc từng phần", GROUP_DEPOSIT,
            "Rút một phần gốc khi cần, phần còn lại tiếp tục hưởng lãi như bình thường.", "Lãi suất tương đương gửi thường, ~5,3%/năm kỳ hạn 12 tháng (tham khảo)."),
    Product("CD_MSB", "Chứng chỉ tiền gửi MSB", GROUP_INVEST,
            "Giấy tờ có giá, tham gia tối thiểu 11 triệu, chuyển nhượng linh hoạt giữa khách hàng.",
            "Sinh lời đến 6,9%/năm; không thuế TNCN trên lợi nhuận; không phí chuyển nhượng.",
            talking_points=["Lợi suất cao hơn tiết kiệm thường", "Chuyển nhượng khi cần thanh khoản"]),
    # A.2 Accounts & cards
    Product("ACC_NICE_NUMBER", "Tài khoản số đẹp / Tài khoản lương", GROUP_ACCOUNT,
            "Chọn số tài khoản theo ý muốn, ưu đãi nhận lương qua MSB.", "Theo biểu phí hiện hành."),
    Product("CARD_NAPAS_DEBIT", "Thẻ ghi nợ nội địa Napas", GROUP_CARD, "Thanh toán, rút tiền ATM nội địa.", "—"),
    Product("CARD_MC_HYBRID", "Thẻ đa năng MSB Mastercard Hybrid", GROUP_CARD,
            "Ghi nợ và tín dụng trên một thẻ vật lý.", "—"),
    Product("CARD_MC_GREEN_WORLD", "MSB Mastercard Green World", GROUP_CARD,
            "Thẻ tín dụng hạn mức từ 100 triệu, trả góp 0% tới 12 tháng tại nhiều đối tác, hoàn tiền di chuyển tới 24 triệu/năm.",
            "Phí thường niên 1.699.000 VND/năm, miễn năm đầu nếu chi tiêu trong 30 ngày kích hoạt.",
            eligibility="Thu nhập chuyển khoản từ 40 triệu/tháng.",
            talking_points=["Trả góp 0% giúp giảm áp lực dư nợ thẻ", "6 lượt phòng chờ sân bay nội địa/năm"]),
    Product("CARD_VISA_SIGNATURE", "MSB Visa Signature", GROUP_CARD,
            "Dòng thẻ hoàn tiền phổ biến.", "Hoàn 10% chi tiêu, tối đa 12 triệu/năm.",
            talking_points=["Thẻ giúp bổ sung một nguồn chi tiêu dự phòng", "Khi thẻ đang dùng gặp sự cố, thẻ này vẫn có thể dùng để thanh toán"]),
    Product("CARD_MC_WORLD_ELITE", "MSB Mastercard World Elite", GROUP_CARD,
            "Dòng thẻ cao cấp, phòng chờ không giới hạn.", "Hoàn tiền 10%, tối đa 36 triệu/năm.",
            talking_points=["Thẻ giúp bổ sung một nguồn chi tiêu dự phòng", "Khi thẻ đang dùng gặp sự cố, thẻ này vẫn có thể dùng để thanh toán"]),
    Product("CARD_MC_FAMILY", "MSB Mastercard Family", GROUP_CARD,
            "Tối ưu chi tiêu gia đình.", "Hoàn tới 30% chi tiêu chăm sóc gia đình."),
    # A.3 Loans
    Product("LOAN_BUSINESS_CAPITAL", "Cho vay bổ sung vốn kinh doanh", GROUP_LOAN,
            "Không yêu cầu ĐKKD; vay từng lần hoặc theo hạn mức quay vòng, thời hạn tối đa 36 tháng, "
            "giải ngân nhanh để bù đắp vốn lưu động.",
            "Lãi suất ưu đãi từ 0,55%/tháng (~6,6%/năm); hạn mức tới 50 tỷ VND, hạn mức nhỏ có thể không cần tài sản đảm bảo.",
            eligibility="Cá nhân có nguồn thu ổn định từ hoạt động kinh doanh (không bắt buộc có ĐKKD), "
                        "dòng tiền CASA ra vào đều đặn thể hiện có kinh doanh thực tế.",
            talking_points=["Không cần đăng ký kinh doanh vẫn vay được", "Giải ngân nhanh, phù hợp bù đắp vốn lưu động ngắn hạn"]),
    Product("LOAN_OVERDRAFT_CONSUMER", "Thấu chi tiêu dùng", GROUP_LOAN,
            "Hạn mức thấu chi trên tài khoản thanh toán, được rút vượt số dư khi cần, cấp lại theo chu kỳ tới 12 tháng.",
            "Lãi suất tính trên số tiền và số ngày thực sử dụng, tham khảo quanh 13%/năm; "
            "ưu đãi hơn nếu gắn với sổ tiết kiệm/tiền gửi làm tài sản đảm bảo.",
            eligibility="Khách đã có tài khoản thanh toán tại MSB, có dòng tiền CASA ổn định hoặc biến động theo mùa vụ.",
            talking_points=["Chỉ tính lãi trên phần thực dùng, không dùng không mất phí",
                             "Rút thẳng trên tài khoản thanh toán, không cần làm hồ sơ vay riêng mỗi lần"]),
    Product("LOAN_HOME_PROJECT", "Vay mua nhà dự án", GROUP_LOAN,
            "Liên kết chủ đầu tư dự án lớn, áp dụng cho nhà hình thành trong tương lai hoặc đã bàn giao, vay tới 40 năm.",
            "Lãi suất từ 0% trong giai đoạn chủ đầu tư hỗ trợ, sau đó theo biểu lãi suất vay mua nhà hiện hành; "
            "ân hạn gốc tới 60 tháng.",
            eligibility="Vốn tự có tối thiểu khoảng 30% giá trị căn nhà; thu nhập chứng minh được tối thiểu 8 triệu/tháng.",
            talking_points=["Ân hạn gốc tới 60 tháng giúp giảm áp lực trả nợ giai đoạn đầu",
                             "Có giai đoạn lãi suất 0% do chủ đầu tư hỗ trợ"]),
    Product("LOAN_CONSUMER", "Vay mua ô tô / xây sửa nhà / tiêu dùng", GROUP_LOAN,
            "Vay có tài sản đảm bảo hoặc tín chấp tuỳ hồ sơ, áp dụng cho mua ô tô, xây/sửa nhà hoặc tiêu dùng cá nhân.",
            "Tham khảo quanh 10–14%/năm tuỳ sản phẩm và tài sản đảm bảo; RB xác nhận biểu lãi suất hiện hành trước khi tư vấn.",
            eligibility="Có thu nhập chứng minh được và lịch sử tín dụng tốt (không nợ xấu).",
            talking_points=["Thủ tục đơn giản, giải ngân nhanh trong vài ngày làm việc"]),
    # A.4 Bancassurance
    Product("BANCA_PRU_PROTECT", "Bảo hiểm liên kết chung Pru – Bảo vệ tối đa", GROUP_BANCA,
            "BHNT liên kết chung (Prudential); tuổi tham gia 30 ngày–70 tuổi; đóng phí bắt buộc 4 năm đầu.",
            "Lãi suất đầu tư cam kết tối thiểu + thưởng tri ân và thưởng duy trì hợp đồng.",
            talking_points=["Phù hợp khẩu vị An toàn", "Bảo vệ khoản vay và người phụ thuộc"]),
    Product("BANCA_PRU_INVEST", "Bảo hiểm liên kết đơn vị Pru – Đầu tư vững tiến", GROUP_BANCA,
            "Bảo vệ tới 110% STBH + giá trị tài khoản; đầu tư qua 7 quỹ PRUlink.",
            "Thưởng kép từ năm hợp đồng thứ 10.",
            eligibility="Phù hợp khẩu vị rủi ro Cân bằng / Rủi ro cao.",
            talking_points=["Vừa bảo vệ vừa đầu tư", "Chọn quỹ theo khẩu vị rủi ro"]),
    Product("BANCA_M_FLEXCARE", "Bảo hiểm sức khỏe toàn cầu M-Flexcare", GROUP_BANCA, "BHPNT sức khỏe, phạm vi toàn cầu.", "—"),
    Product("BANCA_HOSPITAL_CASH", "Bảo hiểm Trợ cấp nằm viện", GROUP_BANCA,
            "Chi trả độc lập với BHYT/BHSK khác.", "Quyền lợi tới 150 triệu/năm."),
    Product("BANCA_CRITICAL_ILLNESS", "Bảo hiểm bệnh hiểm nghèo", GROUP_BANCA, "Chi trả khi chẩn đoán bệnh hiểm nghèo theo danh mục.", "—"),
    Product("BANCA_APARTMENT", "Bảo hiểm chung cư 4.0", GROUP_BANCA,
            "Bảo vệ căn hộ và trách nhiệm với bên thứ ba, cấp đơn 1 chạm.", "Phí từ 0,055% giá trị căn hộ."),
    # A.5 FX, international transfer, investments
    Product("FX_SWIFT_PACKAGE", "Gói ưu đãi tỷ giá & chuyển tiền quốc tế SWIFT", GROUP_FX,
            "Mua bán ngoại tệ theo tỷ giá tham khảo MSB; chuyển tiền quốc tế qua SWIFT / RIA / Western Union.",
            "Tỷ giá ưu đãi theo doanh số; phí theo biểu phí hiện hành.",
            talking_points=["Kèm cảnh báo quản trị rủi ro tỷ giá"]),
    Product("INV_BOND_RB", "Trái phiếu doanh nghiệp qua MSB", GROUP_INVEST,
            "Phân phối theo chính sách hợp tác từng thời kỳ.", "Cán bộ tư vấn tra cứu sản phẩm đang mở bán trước khi tư vấn."),
    Product("INV_FUND_CERT_RB", "Chứng chỉ quỹ đầu tư qua MSB", GROUP_INVEST,
            "Hợp tác phân phối chứng chỉ quỹ mở của VinaCapital và DragonCapital, đầu tư đa dạng cổ phiếu/trái phiếu qua các quỹ uy tín.",
            "Phí/lợi nhuận theo bản cáo bạch từng quỹ tại thời điểm tư vấn; cán bộ tư vấn tra cứu NAV và biểu phí mở bán hiện hành trước khi chốt.",
            talking_points=["Quỹ mở của VinaCapital hoặc DragonCapital, RM có thể so sánh để khách chọn quỹ phù hợp khẩu vị",
                             "Có thể mua thêm định kỳ, không cần theo dõi thị trường hằng ngày"]),
    # Non-product actions
    Product("APP_REACTIVATION", "Kích hoạt lại quan hệ qua App MSB Digital Bank", GROUP_SERVICE,
            "Khảo sát nhu cầu, hướng dẫn tính năng App, kích hoạt lại giao dịch.", "Không phát sinh phí."),
]

_BY_ID = {product.product_id: product for product in PRODUCT_CATALOGUE}

# Next Best Offer families (sheet "Next Best Offer") -> preferred catalogue products.
NBO_FAMILY_PRODUCTS: dict[str, list[str]] = {
    "CREDIT_CARD": ["CARD_MC_GREEN_WORLD", "CARD_VISA_SIGNATURE", "CARD_MC_WORLD_ELITE"],
    "BANCA": ["BANCA_PRU_INVEST", "BANCA_PRU_PROTECT"],
    "FX": ["FX_SWIFT_PACKAGE"],
    "BOND": ["CD_MSB", "INV_BOND_RB"],
    "LOAN": ["LOAN_OVERDRAFT_CONSUMER", "LOAN_BUSINESS_CAPITAL"],
}


def find_product(product_id: str) -> Product | None:
    return _BY_ID.get(product_id)


def products_in_group(group: str) -> list[Product]:
    return [product for product in PRODUCT_CATALOGUE if product.group == group]


def products_for_nbo_family(family: str) -> list[Product]:
    return [_BY_ID[pid] for pid in NBO_FAMILY_PRODUCTS.get(family, []) if pid in _BY_ID]
