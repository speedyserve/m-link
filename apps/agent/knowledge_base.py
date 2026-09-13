from dataclasses import dataclass, field


@dataclass
class Product:
    product_id: str
    product_name: str
    product_group: str
    target_audience: str
    mechanism: str
    benefits: str
    interest_rate: str
    trigger_keywords: list[str]
    cross_selling_trigger: str
    target_segments: list[str] = field(default_factory=list)


PRODUCT_KNOWLEDGE_BASE: list[Product] = [
    Product(
        product_id="CASA_BOOST",
        product_name="Tài khoản sinh lời tự động M-Pro Business / CASA Boost",
        product_group="CASA",
        target_audience="Hộ kinh doanh và cá nhân có số dư nhàn rỗi luân chuyển lớn, ngại gửi tiết kiệm kỳ hạn dài vì sợ thiếu vốn đột xuất.",
        mechanism="Tự động quét số dư nhàn rỗi vào cuối ngày, phần vượt trên hạn mức duy trì tối thiểu 10 triệu VNĐ được hưởng lãi suất bậc thang tính theo ngày.",
        benefits="Tiền vẫn nằm trong tài khoản thanh toán, sẵn sàng rút ra chi trả hoặc nhập hàng bất kỳ lúc nào, không bị gián đoạn và không bị phạt lãi suất.",
        interest_rate="3.6% – 4.0%/năm, theo bậc thang số dư.",
        trigger_keywords=["dòng tiền", "nhàn rỗi", "casa", "sinh lời", "lãi suất", "thanh khoản", "kinh doanh"],
        cross_selling_trigger="Khách hàng có dòng tiền lớn về tài khoản thanh toán và để nhàn rỗi liên tục nhiều ngày mà chưa chuyển sang sản phẩm sinh lời.",
        target_segments=["Khách hàng cá nhân cao cấp", "Chủ hộ kinh doanh"],
    ),
    Product(
        product_id="CD_35NAM",
        product_name="Chứng chỉ tiền gửi Linh hoạt 35 Năm MSB",
        product_group="FD",
        target_audience="Khách hàng có tiền gửi kỳ hạn sắp đáo hạn, hoặc có khoản tiền trung hạn muốn hưởng lãi suất cao nhưng vẫn cần phương án dự phòng khi có nhu cầu vốn khẩn cấp.",
        mechanism="Kỳ hạn 6 – 12 tháng. Cho phép chuyển nhượng và rút vốn linh hoạt từng phần khi khách hàng có nhu cầu khẩn cấp. Phần tiền còn lại vẫn được bảo toàn nguyên mức lãi suất cao ban đầu.",
        benefits="Lãi suất cao, cộng thêm ưu đãi kỷ niệm 35 năm, cho phép rút vốn linh hoạt từng phần.",
        interest_rate="6.2% – 6.8%/năm, cộng thêm 0.35%/năm nhân dịp kỷ niệm 35 năm thành lập MSB.",
        trigger_keywords=["đáo hạn", "tái tục", "tiền gửi", "chứng chỉ tiền gửi", "lãi suất ưu đãi", "35 năm"],
        cross_selling_trigger="Khách hàng có sổ tiết kiệm sắp đáo hạn trong vòng 7 ngày, đặc biệt là các sổ chưa đăng ký tự động tái tục.",
        target_segments=["Khách hàng cá nhân cao cấp", "Chủ hộ kinh doanh"],
    ),
    Product(
        product_id="VISA_SIGNATURE",
        product_name="Thẻ tín dụng MSB Visa Signature / MSB Cashback Card",
        product_group="CREDIT_CARD",
        target_audience="Khách hàng chi tiêu thẻ đều đặn, tập trung vào nhóm ẩm thực, nhà hàng, khách sạn và du lịch, có lịch sử thanh toán sao kê tốt.",
        mechanism="Hoàn tiền lên tới 10% cho các giao dịch Ẩm thực, Nhà hàng và Khách sạn, tối đa 1.000.000 VNĐ mỗi tháng. Tích lũy dặm bay và điểm thưởng Lotusmiles nhân 3 vào các ngày cuối tuần. Tặng bảo hiểm du lịch toàn cầu với giá trị bảo hiểm lên đến 10,5 tỷ VNĐ.",
        benefits="Hoàn tiền 10% ẩm thực, tích điểm nhân 3 cuối tuần, bảo hiểm du lịch toàn cầu 10,5 tỷ VNĐ.",
        interest_rate="Không áp dụng.",
        trigger_keywords=["tín dụng", "hoàn tiền", "ẩm thực", "thẻ", "nâng hạng", "visa signature", "phong cách sống", "du lịch"],
        cross_selling_trigger="Khách hàng có tỷ trọng chi tiêu nhóm ẩm thực chiếm trên 40% tổng chi tiêu thẻ, đồng thời có lịch sử thanh toán sao kê đúng hạn và đủ.",
        target_segments=["Khách hàng cá nhân cao cấp"],
    ),
    Product(
        product_id="AUTO_DEBIT",
        product_name="Tiện ích MSB Auto-Debit Utility",
        product_group="VAS",
        target_audience="Khách hàng bận rộn, đang thanh toán hóa đơn thủ công, đã hoặc có nguy cơ bị trễ hạn thanh toán điện nước, viễn thông.",
        mechanism="Ngân hàng tự động truy vấn cước từ nhà cung cấp (EVN, công ty cấp nước, VNPT/Viettel) và trích nợ tự động vào đúng ngày đến hạn, sau đó gửi thông báo xác nhận qua ứng dụng hoặc SMS.",
        benefits="Miễn 100% phí đăng ký và phí duy trì dịch vụ trọn đời. Hoàn tiền 5% giá trị hóa đơn, tối đa 100.000 VNĐ mỗi tháng, áp dụng trong 3 tháng đầu tiên kể từ khi kích hoạt trích nợ tự động.",
        interest_rate="Không áp dụng.",
        trigger_keywords=["thanh toán", "điện nước", "chuyển đổi số", "auto-debit", "trễ hạn", "tiện ích", "tự động", "hoàn tiền"],
        cross_selling_trigger="Khách hàng đang thanh toán hóa đơn thủ công, đặc biệt những khách đã từng có ít nhất một lần trễ hạn trong 12 tháng gần nhất.",
        target_segments=["Khách hàng cá nhân cao cấp", "Chủ hộ kinh doanh"],
    ),
]


def find_products_by_group(product_group: str) -> list[Product]:
    return [p for p in PRODUCT_KNOWLEDGE_BASE if p.product_group == product_group]


def find_product_by_id(product_id: str) -> Product | None:
    for p in PRODUCT_KNOWLEDGE_BASE:
        if p.product_id == product_id:
            return p
    return None


def match_product_for_signal(product_group: str, signal_classification: str = None) -> Product | None:
    products = find_products_by_group(product_group)
    if not products:
        return None
    return products[0]