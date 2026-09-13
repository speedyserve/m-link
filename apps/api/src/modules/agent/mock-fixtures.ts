import type { CustomerAnalysis, Locale } from '@mlink/contracts';

export function buildMockAnalysis(customerId: string, locale: Locale, runId: string): CustomerAnalysis {
  const en = locale === 'en';
  if (customerId === 'CUS001') {
    return {
      runId,
      customerId,
      summary: {
        relationshipStatus: 'healthy',
        opportunityScore: 92,
        overview: en
          ? 'Priority customer with significant recent liquidity and an upcoming deposit maturity.'
          : 'Khách hàng Priority có nguồn tiền lớn mới về và khoản tiền gửi sắp đáo hạn.',
      },
      signals: [
        {
          type: 'idle_cash',
          title: en ? 'Large idle balance' : 'Số dư nhàn rỗi lớn',
          severity: 'high',
          confidence: 0.94,
          description: en
            ? 'A 500M VND balance has remained largely unused for seven days.'
            : 'Khoảng 500 triệu VND đã duy trì nhàn rỗi trong bảy ngày.',
        },
        {
          type: 'deposit_maturity',
          title: en ? 'Deposit matures soon' : 'Tiền gửi sắp đáo hạn',
          severity: 'medium',
          confidence: 0.9,
          description: en ? 'A fixed deposit matures in five days.' : 'Một khoản tiền gửi đáo hạn sau năm ngày.',
        },
      ],
      recommendations: [
        {
          priority: 1,
          type: 'cash_optimization',
          title: en ? 'Discuss idle cash optimization' : 'Trao đổi phương án tối ưu tiền nhàn rỗi',
          description: en ? 'Review M-Pro as an option for available liquidity.' : 'Xem xét M-Pro cho nguồn tiền đang sẵn có.',
          confidence: 0.92,
          product: { id: 'M_PRO', name: 'M-Pro' },
          reasons: en
            ? ['Large recent balance increase', 'Balance remained idle']
            : ['Số dư tăng mạnh gần đây', 'Nguồn tiền vẫn đang nhàn rỗi'],
          evidence: [
            {
              type: 'transaction',
              title: en ? 'Large incoming transfer' : 'Giao dịch tiền về lớn',
              description: en ? '500M VND received recently' : '500 triệu VND mới được ghi có',
              source: 'transaction',
              sourceReference: 'TX0001',
            },
          ],
          script: en
            ? 'I noticed that your account recently received a significant balance. May we review options that keep it flexible while improving returns?'
            : 'Em nhận thấy gần đây tài khoản của anh/chị có nguồn tiền lớn mới về. Mình có thể cùng xem phương án vừa linh hoạt vừa tối ưu lợi tức không ạ?',
        },
        {
          priority: 2,
          type: 'deposit_renewal',
          title: en ? 'Prepare deposit renewal' : 'Chuẩn bị phương án tái tục tiền gửi',
          description: en ? 'Review renewal preferences before maturity.' : 'Trao đổi nhu cầu tái tục trước ngày đáo hạn.',
          confidence: 0.86,
          product: { id: 'FD_RENEWAL', name: en ? 'Term deposit' : 'Tiền gửi kỳ hạn' },
          reasons: [en ? 'Deposit matures in five days' : 'Khoản tiền gửi đáo hạn sau năm ngày'],
          evidence: [
            {
              type: 'deposit',
              title: en ? 'Upcoming maturity' : 'Ngày đáo hạn sắp tới',
              description: en ? 'Priority 6-month deposit matures soon' : 'Tiền gửi Priority 6 tháng sắp đáo hạn',
              source: 'deposit',
              sourceReference: 'DEP001',
            },
          ],
          script: en
            ? 'Your deposit will mature shortly. Would you like us to review the renewal options together?'
            : 'Khoản tiền gửi của anh/chị sắp đáo hạn. Em xin phép cùng anh/chị xem trước các lựa chọn tái tục nhé?',
        },
      ],
      guardrail: { sellAllowed: true, reason: null },
    };
  }

  if (customerId === 'CUS002') {
    return {
      runId,
      customerId,
      summary: {
        relationshipStatus: 'customer_care_first',
        opportunityScore: 0,
        overview: en
          ? 'Resolve the open complaint before any product conversation.'
          : 'Cần xử lý khiếu nại đang mở trước mọi trao đổi về sản phẩm.',
      },
      signals: [
        {
          type: 'open_complaint',
          title: en ? 'Open customer complaint' : 'Khiếu nại chưa được xử lý',
          severity: 'high',
          confidence: 0.99,
          description: en
            ? 'Three recent service contacts have negative sentiment.'
            : 'Ba tương tác dịch vụ gần đây có cảm xúc tiêu cực.',
        },
      ],
      recommendations: [],
      guardrail: {
        sellAllowed: false,
        reason: en ? 'Open complaint and repeated negative contacts' : 'Khiếu nại đang mở và nhiều lần liên hệ tiêu cực',
      },
    };
  }

  return {
    runId,
    customerId,
    summary: {
      relationshipStatus: 'healthy',
      opportunityScore: 18,
      overview: en
        ? 'No sufficiently strong customer need was identified.'
        : 'Chưa ghi nhận nhu cầu khách hàng đủ rõ ràng.',
    },
    signals: [],
    recommendations: [],
    guardrail: { sellAllowed: true, reason: null },
  };
}

