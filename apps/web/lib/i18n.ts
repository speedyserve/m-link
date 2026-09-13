export const messages = {
  vi: {
    dashboard: 'Tổng quan', customers: 'Khách hàng', welcome: 'Chào buổi sáng', portfolio: 'Danh mục khách hàng',
    totalCustomers: 'Tổng khách hàng', needAttention: 'Cần chú ý', highPriority: 'Ưu tiên cao', customerCare: 'Chăm sóc trước',
    priorityCustomers: 'Ưu tiên hôm nay', viewCustomer: 'Mở hồ sơ', search: 'Tìm kiếm', segment: 'Phân khúc', all: 'Tất cả',
    customer360: 'Hồ sơ 360°', overview: 'Tổng quan', transactions: 'Giao dịch', cards: 'Thẻ', deposits: 'Tiền gửi', interactions: 'Tương tác', aiInsights: 'AI Insights',
    totalAssets: 'Tổng tài sản', casa: 'CASA', creditLimit: 'Hạn mức tín dụng', recentTransactions: 'Giao dịch gần đây',
    analyze: 'Phân tích với M-Link', analyzing: 'M-Link đang phân tích khách hàng...', summary: 'Tóm tắt khách hàng', signals: 'Tín hiệu', nextBestAction: 'Hành động tốt nhất', why: 'Tại sao', evidence: 'Bằng chứng', suggestedScript: 'Kịch bản gợi ý',
    careFirst: 'ƯU TIÊN CHĂM SÓC KHÁCH HÀNG', doNotSell: 'KHÔNG BÁN HÀNG', noAction: 'KHÔNG KHUYẾN NGHỊ HÀNH ĐỘNG', doNotDisturb: 'Tránh liên hệ không cần thiết.',
    history: 'Lịch sử phân tích', confidence: 'Độ tin cậy', useful: 'Hữu ích', notRelevant: 'Không phù hợp', contacted: 'Đã liên hệ', interested: 'Khách quan tâm', rejected: 'Khách từ chối', empty: 'Chưa có dữ liệu', error: 'Không thể tải dữ liệu. Vui lòng thử lại.',
  },
  en: {
    dashboard: 'Dashboard', customers: 'Customers', welcome: 'Good morning', portfolio: 'Customer portfolio',
    totalCustomers: 'Total customers', needAttention: 'Needs attention', highPriority: 'High priority', customerCare: 'Customer care',
    priorityCustomers: "Today's priorities", viewCustomer: 'Open customer', search: 'Search', segment: 'Segment', all: 'All',
    customer360: 'Customer 360°', overview: 'Overview', transactions: 'Transactions', cards: 'Cards', deposits: 'Deposits', interactions: 'Interactions', aiInsights: 'AI Insights',
    totalAssets: 'Total assets', casa: 'CASA', creditLimit: 'Credit limit', recentTransactions: 'Recent transactions',
    analyze: 'Analyze with M-Link', analyzing: 'M-Link is analyzing this customer...', summary: 'Customer summary', signals: 'Signals', nextBestAction: 'Next Best Action', why: 'Why', evidence: 'Evidence', suggestedScript: 'Suggested script',
    careFirst: 'CUSTOMER CARE FIRST', doNotSell: 'DO NOT SELL', noAction: 'NO ACTION RECOMMENDED', doNotDisturb: 'Avoid unnecessary outreach.',
    history: 'Analysis history', confidence: 'Confidence', useful: 'Useful', notRelevant: 'Not relevant', contacted: 'Contacted', interested: 'Customer interested', rejected: 'Customer rejected', empty: 'No data yet', error: 'Unable to load data. Please try again.',
  },
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof messages.vi;

