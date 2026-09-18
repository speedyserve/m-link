'use client';

import type { CustomerMetrics, NextBestOffer, ProductHolding, SuggestionCode } from '@mlink/contracts';
import { PRODUCT_CODES } from '@mlink/contracts';
import type { useApp } from '@/components/providers';
import { Badge } from '@/components/ui';
import { money } from '@/lib/api';

type T = ReturnType<typeof useApp>['t'];
type Locale = 'vi' | 'en';

export const PRODUCT_LABELS: Record<string, { vi: string; en: string }> = {
  ACCOUNT: { vi: 'Tài khoản', en: 'Account' }, CASA: { vi: 'CASA', en: 'CASA' }, FD: { vi: 'Tiết kiệm (FD)', en: 'Term deposit' },
  LOAN_ADVANCE: { vi: 'Vay ứng vốn', en: 'Pledged-deposit loan' }, BOND: { vi: 'Trái phiếu', en: 'Bond' },
  CREDIT_CARD: { vi: 'Thẻ tín dụng', en: 'Credit card' }, LOAN_OVERDRAFT: { vi: 'Vay thấu chi', en: 'Overdraft' },
  LOAN_UNSECURED: { vi: 'Vay tín chấp', en: 'Unsecured loan' }, LOAN_MORTGAGE: { vi: 'Vay thế chấp', en: 'Mortgage' },
  FX: { vi: 'Ngoại hối', en: 'FX' }, BANCA_LIFE: { vi: 'BH nhân thọ', en: 'Life insurance' },
  BANCA_NONLIFE: { vi: 'BH phi nhân thọ', en: 'Non-life insurance' }, FUND_CERT: { vi: 'Chứng chỉ quỹ', en: 'Fund certificates' },
  BANCA: { vi: 'Bancassurance', en: 'Bancassurance' }, LOAN: { vi: 'Vay vốn', en: 'Loan' },
};

export const SUGGESTION_TEXT: Record<SuggestionCode, { vi: string; en: string }> = {
  LEVERAGE_HIGH: { vi: 'Đòn bẩy cao — tư vấn bảo hiểm bảo vệ khoản vay, KHÔNG chào vay thêm', en: 'High leverage — loan-protection insurance, no new loans' },
  CUR_HIGH: { vi: 'CUR thẻ cao — cơ cấu nợ / trả góp 0%, KHÔNG chào vay thêm', en: 'High card utilisation — restructure / 0% instalments, no new loans' },
  CHURN_HIGH: { vi: 'Rủi ro rời bỏ CAO — gọi giữ chân, ưu đãi lãi suất KHƯT', en: 'HIGH churn risk — retention call, priority rates' },
  RISK_MISMATCH: { vi: 'Lệch khẩu vị rủi ro — rà soát suitability trước khi tư vấn', en: 'Risk-appetite mismatch — review suitability first' },
  UNDER_PENETRATED: { vi: 'Giá trị cao, chưa khai thác — cross-sell toàn diện', en: 'High value, under-penetrated — full cross-sell' },
  CASA_SURGE_NO_BOND: { vi: 'CASA tăng mạnh, chưa có Bond — giới thiệu CCTG MSB / Pru Đầu tư vững tiến', en: 'CASA surging, no bonds — MSB CD / Pru unit-linked' },
  DORMANT: { vi: 'Lâu không giao dịch — khảo sát nhu cầu, kích hoạt lại', en: 'Dormant — survey needs and reactivate' },
  MAINTAIN: { vi: 'Duy trì chăm sóc định kỳ, theo dõi thêm', en: 'Maintain regular care and monitor' },
};

export const churnTone = (label: string) => (label === 'Cao' ? 'danger' : label === 'Trung bình' ? 'warn' : 'good') as 'danger' | 'warn' | 'good';
export const churnText = (label: string, t: T) => (label === 'Cao' ? t('churnHigh') : label === 'Trung bình' ? t('churnMedium') : t('churnLow'));

const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const ratio = (value: number) => (value > 2 ? `${value.toFixed(1)}x` : pct(value));
const signedPct = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const score = (value: number) => value.toFixed(1);

export function MetricsPanel({ metrics, locale, t }: { metrics: CustomerMetrics & { windowDays?: number }; locale: Locale; t: T }) {
  // Window-based metrics follow the filtered period, so every such label states its length.
  const windowDays = metrics.windowDays ?? 90;
  const win = (label: string) => `${label} · ${windowDays} ${t('daysUnit')}`;
  const rows: Array<[string, string, string?]> = [
    [t('recency'), `${metrics.recencyDays}`],
    [win(t('frequency90')), `${metrics.freq90}`, `${t('frequencyPrev90')}: ${metrics.freqPrev90}`],
    [win(t('casaAvg90')), money(metrics.casaAvg90, locale)],
    [win(t('casaTrend')), signedPct(metrics.casaTrend), metrics.fdLiquidated ? t('fdLiquidated') : undefined],
    [win(t('casaCv')), metrics.casaCv.toFixed(3)],
    [win(t('cardUtilization')), pct(metrics.cur), `${money(metrics.ccAvgBalance90, locale)} / ${money(metrics.creditLimit, locale)}`],
    [t('leverage'), ratio(metrics.leverage), `${money(metrics.loanTotal, locale)} / ${money(metrics.tav, locale)}`],
    [t('productHolding'), `${pct(metrics.phs, 0)} · ${metrics.holdingCount}/13`, metrics.phsLabel],
    [t('riskAppetite'), pct(metrics.ras, 0), metrics.rasRaw > 1 ? `raw ${metrics.rasRaw.toFixed(2)} · ${metrics.riskAppetiteLabel}` : metrics.riskAppetiteLabel],
    [t('totalAssetValue'), money(metrics.tav, locale), `${t('tier')} ${t('computed')}: ${metrics.tierLabel}`],
    [t('fxVolume'), money(metrics.fxVolume12m, locale)],
  ];
  const scores: Array<[string, number, 'good' | 'warn' | 'danger' | 'neutral']> = [
    [t('valueScore'), metrics.valueScore, 'good'],
    [t('churnScore'), metrics.churnScore, churnTone(metrics.churnLabel)],
    [t('crossSellScore'), metrics.crossSellScore, 'neutral'],
    [t('priorityScore'), metrics.priorityScore, 'good'],
  ];
  return <div className="card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-extrabold">{t('metrics')}</h2><p className="text-xs text-navy-500">{t('asOf')} {metrics.asOfDate}</p></div>
      <div className="flex flex-wrap gap-2"><Badge tone={churnTone(metrics.churnLabel)}>{churnText(metrics.churnLabel, t)}</Badge><Badge>{t('behaviour')}: {metrics.behaviourLabel}</Badge></div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-4">{scores.map(([label, value, tone]) => <div key={label} className={`rounded-xl p-4 ${tone === 'danger' ? 'bg-red-50' : tone === 'warn' ? 'bg-orange-50' : tone === 'good' ? 'bg-orange-50' : 'bg-navy-50'}`}><div className="label">{label}</div><div className="mt-1 text-2xl font-black">{score(value)}</div></div>)}</div>
    <dl className="mt-5 divide-y divide-navy-100 text-sm">{rows.map(([label, value, hint]) => <div key={label} className="flex items-start justify-between gap-4 py-2.5"><dt className="text-navy-500">{label}</dt><dd className="text-right"><div className="font-bold">{value}</div>{hint && <div className="text-xs text-navy-500">{hint}</div>}</dd></div>)}</dl>
    <div className="mt-4 rounded-xl border border-navy-100 bg-orange-50 p-4 text-sm"><div className="label">{t('suggestion')}</div><p className="mt-1 font-semibold text-navy-900">{SUGGESTION_TEXT[metrics.suggestionCode][locale]}</p></div>
  </div>;
}

export function HoldingMatrix({ holdings, offers, locale, t }: { holdings: ProductHolding[]; offers: NextBestOffer[]; locale: Locale; t: T }) {
  const held = new Map(holdings.map((row) => [row.productCode, row.held]));
  const ranked = offers.filter((row) => row.rank !== null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return <div className="card p-5">
    <h2 className="font-extrabold">{t('productsHeld')}</h2>
    <div className="mt-4 flex flex-wrap gap-2">{PRODUCT_CODES.map((code) => <span key={code} className={`rounded-full px-3 py-1 text-xs font-bold ${held.get(code) ? 'bg-navy-800 text-white' : 'bg-navy-100 text-navy-500 line-through'}`}>{PRODUCT_LABELS[code]?.[locale] ?? code}</span>)}</div>
    {!!ranked.length && <div className="mt-5"><h3 className="text-sm font-extrabold">{t('nextBestOffer')}</h3><ol className="mt-2 space-y-1 text-sm">{ranked.map((row) => <li key={row.productCode} className="flex justify-between"><span>{PRODUCT_LABELS[row.productCode]?.[locale] ?? row.productCode}</span><Badge tone={row.rank === 1 ? 'good' : 'neutral'}>{t('rank')} {row.rank}</Badge></li>)}</ol></div>}
  </div>;
}
