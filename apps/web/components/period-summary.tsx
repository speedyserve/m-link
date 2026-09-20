'use client';

import type { BalanceKey, FlowCategory, PeriodSummary } from '@mlink/contracts';
import { BALANCE_KEYS, FLOW_CATEGORIES } from '@mlink/contracts';
import type { useApp } from '@/components/providers';
import { money } from '@/lib/api';

type T = ReturnType<typeof useApp>['t'];
type Locale = 'vi' | 'en';

export const BALANCE_LABELS: Record<BalanceKey, { vi: string; en: string }> = {
  accountBalance: { vi: 'Tài khoản thanh toán', en: 'Payment account' }, casaBalance: { vi: 'CASA', en: 'CASA' },
  fdBalance: { vi: 'Tiết kiệm (FD)', en: 'Term deposit' }, bondBalance: { vi: 'Trái phiếu', en: 'Bond' },
  fundCertValue: { vi: 'Chứng chỉ quỹ', en: 'Fund certificates' }, loanAdvance: { vi: 'Vay ứng vốn', en: 'Pledged-deposit loan' },
  loanOverdraft: { vi: 'Vay thấu chi', en: 'Overdraft' }, loanUnsecured: { vi: 'Vay tín chấp', en: 'Unsecured loan' },
  loanMortgage: { vi: 'Vay thế chấp', en: 'Mortgage' }, loanTotal: { vi: 'Tổng dư nợ vay', en: 'Total loans' },
  creditCardBalance: { vi: 'Dư nợ thẻ tín dụng', en: 'Credit card balance' },
};

export const FLOW_LABELS: Record<FlowCategory, { vi: string; en: string }> = {
  CC_SPEND: { vi: 'Chi tiêu thẻ tín dụng', en: 'Credit card spend' }, FX: { vi: 'Giao dịch ngoại tệ', en: 'FX' },
  BANCA_LIFE: { vi: 'Phí BH nhân thọ', en: 'Life insurance premium' }, BANCA_NONLIFE: { vi: 'Phí BH phi nhân thọ', en: 'Non-life premium' },
  MOBILE_TOPUP: { vi: 'Nạp thẻ điện thoại', en: 'Mobile top-up' }, BILL_PAYMENT: { vi: 'Thanh toán hóa đơn', en: 'Bill payment' },
  SECURITIES: { vi: 'Đầu tư chứng khoán', en: 'Securities' }, AIRLINE: { vi: 'Vé máy bay', en: 'Airline tickets' },
  BUS_TICKET: { vi: 'Vé xe khách', en: 'Bus tickets' }, LOTTERY: { vi: 'Vietlott', en: 'Lottery' },
  LOAN_REPAYMENT: { vi: 'Trả nợ / thu nợ', en: 'Loan repayment' }, GENETICA: { vi: 'SP hợp tác Genetica', en: 'Genetica partner' },
  ADVISORY_FEE: { vi: 'Phí tư vấn tài chính', en: 'Advisory fee' }, WESTERN_UNION: { vi: 'Phí Western Union', en: 'Western Union fee' },
  PREMIUM_ACCOUNT_FEE: { vi: 'Phí tài khoản số đẹp', en: 'Premium account fee' },
};

const signed = (value: number, locale: Locale) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value), locale)}`;
const pctChange = (start: number, end: number) => (start ? `${end - start > 0 ? '+' : ''}${(((end - start) / start) * 100).toFixed(1)}%` : '—');

export function PeriodSummaryCard({ summary, locale, t }: { summary: PeriodSummary; locale: Locale; t: T }) {
  const balances = BALANCE_KEYS.filter((key) => key !== 'loanTotal' && (summary.balances[key].max !== 0 || summary.balances[key].min !== 0));
  const flows = FLOW_CATEGORIES.map((category) => ({ category, ...summary.flows[category] })).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  const tone = summary.totalAssets.change > 0 ? 'text-success' : summary.totalAssets.change < 0 ? 'text-danger' : 'text-navy-500';
  return <div className="card">
    <div className="card-head"><h2 className="text-base font-extrabold">{t('periodSummary')}</h2><span className="text-xs font-semibold text-navy-500">{summary.range.from} → {summary.range.to} · {summary.range.days} {t('daysUnit')}</span></div>
    <div className="p-5">
    <div className="grid gap-3 sm:grid-cols-4">
      {[[t('openingBalance'), money(summary.totalAssets.start, locale)], [t('closingBalance'), money(summary.totalAssets.end, locale)], [t('averageBalance'), money(summary.totalAssets.avg, locale)]].map(([label, value]) => <div key={label} className="rounded-xl bg-navy-50 p-4"><div className="label">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>)}
      <div className="rounded-xl bg-navy-50 p-4"><div className="label">{t('change')}</div><div className={`mt-1 text-lg font-black ${tone}`}>{signed(summary.totalAssets.change, locale)}</div><div className="text-xs text-navy-500">{pctChange(summary.totalAssets.start, summary.totalAssets.end)}</div></div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
      <div className="rounded-xl border border-navy-100 p-3"><div className="label">{t('activeDays')}</div><div className="font-bold">{summary.activity.activeDays}/{summary.activity.days}</div></div>
      <div className="rounded-xl border border-navy-100 p-3"><div className="label">{t('txnCount')}</div><div className="font-bold">{summary.activity.txnCount}</div></div>
      <div className="rounded-xl border border-navy-100 p-3"><div className="label">{t('lastActive')}</div><div className="font-bold">{summary.activity.lastActiveDate ?? '—'}</div></div>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div><h3 className="text-sm font-extrabold">{t('balancesInPeriod')}</h3><div className="table-wrap mt-2"><table className="text-sm"><thead><tr><th>{t('product')}</th><th className="text-right">{t('openingBalance')}</th><th className="text-right">{t('closingBalance')}</th><th className="text-right">{t('averageBalance')}</th></tr></thead><tbody>{balances.map((key) => { const b = summary.balances[key]; return <tr key={key}><td className="font-semibold">{BALANCE_LABELS[key][locale]}</td><td className="text-right">{money(b.start, locale)}</td><td className="text-right">{money(b.end, locale)}<div className={`text-xs ${b.change > 0 ? 'text-success' : b.change < 0 ? 'text-danger' : 'text-navy-500'}`}>{b.change ? signed(b.change, locale) : '—'}</div></td><td className="text-right text-navy-500">{money(b.avg, locale)}</td></tr>; })}</tbody></table></div></div>
      <div><h3 className="text-sm font-extrabold">{t('flowsInPeriod')}</h3>{flows.length ? <div className="table-wrap mt-2"><table className="text-sm"><thead><tr><th>{t('category')}</th><th className="text-right">{t('total')}</th><th className="text-right">{t('daysWithActivity')}</th></tr></thead><tbody>{flows.map((row) => <tr key={row.category}><td className="font-semibold">{FLOW_LABELS[row.category][locale]}{row.category === 'SECURITIES' && row.buy !== undefined && <div className="text-xs text-navy-500">{t('buy')} {money(row.buy, locale)} · {t('sell')} {money(row.sell ?? 0, locale)}</div>}</td><td className="text-right">{money(row.total, locale)}</td><td className="text-right text-navy-500">{row.days}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-navy-500">{t('empty')}</p>}</div>
    </div>
    </div>
  </div>;
}
