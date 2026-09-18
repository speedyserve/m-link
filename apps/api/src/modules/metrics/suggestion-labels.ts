import type { SuggestionCode } from '@mlink/contracts';

/** Column AD of sheet "Chỉ số đánh giá KH", kept verbatim so the RB queue reads like the workbook. */
export const SUGGESTION_LABELS: Record<SuggestionCode, { vi: string; en: string }> = {
  LEVERAGE_HIGH: {
    vi: 'Đòn bẩy cao — ưu tiên tư vấn Bảo hiểm bảo vệ khoản vay (Pru – Bảo vệ tối đa); KHÔNG chào vay thêm',
    en: 'High leverage — prioritise loan-protection insurance (Pru – Bảo vệ tối đa); do NOT offer new loans',
  },
  CUR_HIGH: {
    vi: 'CUR thẻ TD cao — tư vấn cơ cấu nợ / trả góp 0% (Green World); KHÔNG chào vay thêm',
    en: 'High card utilisation — advise restructuring / 0% instalments (Green World); do NOT offer new loans',
  },
  CHURN_HIGH: {
    vi: 'Rủi ro rời bỏ CAO — ưu tiên gọi giữ chân, ưu đãi lãi suất KHƯT, hẹn gặp trực tiếp',
    en: 'HIGH churn risk — retention call first, priority-customer rate bonus, book a meeting',
  },
  RISK_MISMATCH: {
    vi: 'Cảnh báo lệch khẩu vị rủi ro — rà soát suitability trước khi tư vấn thêm',
    en: 'Risk-appetite mismatch — review suitability before advising further',
  },
  UNDER_PENETRATED: {
    vi: 'KH chưa khai thác, giá trị cao — ưu tiên cross-sell toàn diện (thẻ TD, Bancassurance, FX, CCQ)',
    en: 'Under-penetrated high-value customer — full cross-sell (credit card, bancassurance, FX, funds)',
  },
  CASA_SURGE_NO_BOND: {
    vi: 'CASA tăng mạnh, chưa có Bond — giới thiệu CCTG MSB / Bảo hiểm liên kết đơn vị Pru',
    en: 'CASA surging without bonds — introduce MSB certificates of deposit / Pru unit-linked insurance',
  },
  DORMANT: {
    vi: 'Không phát sinh giao dịch lâu ngày — liên hệ khảo sát nhu cầu, kích hoạt lại quan hệ',
    en: 'Dormant for a long period — contact to survey needs and reactivate the relationship',
  },
  MAINTAIN: {
    vi: 'Duy trì chăm sóc định kỳ, theo dõi thêm',
    en: 'Maintain regular care and keep monitoring',
  },
};
