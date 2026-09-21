'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnalysisPeriod, CustomerMetrics, CustomerMetricsAsOf, FlowCategory, PeriodSummary, ProductHolding } from '@mlink/contracts';
import { FLOW_CATEGORIES } from '@mlink/contracts';
import { AlertOctagon, AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, CreditCard, Landmark, Lightbulb, MessageSquareText, PieChart, PiggyBank, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HoldingMatrix, MetricsPanel, churnText, churnTone } from '@/components/metrics-panel';
import { PeriodFilter, formatDay, usePeriod, type DataRange, type Period } from '@/components/period-filter';
import { FLOW_LABELS, PeriodSummaryCard } from '@/components/period-summary';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Empty, ErrorBox, Tabs } from '@/components/ui';
import { api, money } from '@/lib/api';

type Customer = { id: string; customerCode: string; fullName: string; segment: string; tier: string; branch: string | null; relationshipStatus: string; customerSince: string; dateOfBirth: string; email: string; phone: string; occupation: string | null; declaredBehaviour: string | null; declaredRiskAppetite: string | null; churnWarning: boolean; behaviourNote: string | null; financialSummary: { totalAssets: string; casa: string; deposits: string; creditLimit: string }; metrics: CustomerMetrics | null; holdings: ProductHolding[] };
type Account = { id: string; accountNumber: string; type: string; currency: string; balance: string; availableBalance: string; status: string };
type Transaction = { id: string; transactionCode: string; type: string; category: string; amount: string; description: string; merchant: string | null; transactionAt: string; balanceAfter: string };
type Card = { id: string; maskedNumber: string; type: string; creditLimit: string; availableLimit: string; status: string; expiryDate: string };
type Deposit = { id: string; productName: string; principal: string; interestRate: string | null; startDate: string; maturityDate: string | null; status: string };
type Interaction = { id: string; channel: string; type: string; sentiment: string; subject: string; summary: string; status: string; interactionAt: string };
type Position = { positionDate: string; dayIndex: number; casaBalance: number; fdBalance: number; bondBalance: number; fundCertValue: number; creditCardBalance: number; loanTotal: number; txnCount: number };
type Page<T> = { items: T[]; total: number; page: number; limit: number; totalPages: number };
type History = { id: string; provider: string; status: string; createdAt: string; latencyMs: number | null; period: AnalysisPeriod | null; periodApplied: boolean | null; error: { code: string; message: string } | null };
type AnalysisData = {
  id: string; provider: string; status: string; latencyMs: number | null; createdAt: string; period: AnalysisPeriod | null; periodApplied: boolean | null;
  analysis: null | { summary: { relationshipStatus: string; opportunityScore: number; overview: string }; signals: Array<{ type: string; title: string; severity: string; confidence: number; description: string }>; guardrail: { sellAllowed: boolean; reason: string | null } };
  recommendations: Array<{ id: string; priority: number; title: string; description: string; confidence: number; product: { id: string; name: string } | null; reasons: string[]; script: string; evidence: Array<{ id: string; title: string; description: string; sourceReference: string | null }> }>;
};
type TxFilters = { type: '' | 'CREDIT' | 'DEBIT'; category: '' | FlowCategory; page: number };

const tabs = ['overview', 'transactions', 'cards', 'deposits', 'interactions', 'aiInsights'] as const;
type Tab = typeof tabs[number];
type Locale = 'vi' | 'en';
type T = ReturnType<typeof useApp>['t'];
const TX_PAGE_SIZE = 25;
const TREND_SERIES = [
  { key: 'casa' as const, name: 'CASA', color: '#1f3357' },
  { key: 'fd' as const, name: 'FD', color: '#ea4e24' },
  { key: 'invest' as const, name: 'Bond + CCQ', color: '#157f4d' },
];

export default function CustomerDetailPage() {
  return <Suspense fallback={<div className="skeleton h-72"/>}><CustomerDetail/></Suspense>;
}

function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { rmId, locale, t } = useApp();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [txFilters, setTxFilters] = useState<TxFilters>({ type: '', category: '', page: 1 });
  const customer = useQuery({ queryKey: ['customer', rmId, id], queryFn: () => api<Customer>(`/api/customers/${id}`, rmId) });
  const dataRange = useQuery({ queryKey: ['data-range', rmId, id], queryFn: () => api<DataRange>(`/api/customers/${id}/data-range`, rmId) });
  const { period, setPeriod } = usePeriod(dataRange.data);
  const from = period?.from ?? '';
  const to = period?.to ?? '';
  const ready = Boolean(period);
  useEffect(() => { setTxFilters((current) => ({ ...current, page: 1 })); }, [from, to]);

  const accounts = useQuery({ queryKey: ['accounts', rmId, id], queryFn: () => api<Account[]>(`/api/customers/${id}/accounts`, rmId) });
  const summary = useQuery({ queryKey: ['period-summary', rmId, id, from, to], enabled: ready, queryFn: () => api<PeriodSummary>(`/api/customers/${id}/period-summary?from=${from}&to=${to}`, rmId) });
  const metrics = useQuery({ queryKey: ['metrics-asof', rmId, id, to], enabled: ready, queryFn: () => api<CustomerMetricsAsOf>(`/api/customers/${id}/metrics?asOf=${to}`, rmId) });
  const positions = useQuery({ queryKey: ['positions', rmId, id, from, to], enabled: ready, queryFn: () => api<Position[]>(`/api/customers/${id}/positions?from=${from}&to=${to}`, rmId) });
  const txParams = new URLSearchParams({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z`, page: String(txFilters.page), limit: String(TX_PAGE_SIZE) });
  if (txFilters.type) txParams.set('type', txFilters.type);
  if (txFilters.category) txParams.set('category', txFilters.category);
  const transactions = useQuery({ queryKey: ['transactions', rmId, id, from, to, txFilters], enabled: ready, queryFn: () => api<Page<Transaction>>(`/api/customers/${id}/transactions?${txParams}`, rmId) });
  const cards = useQuery({ queryKey: ['cards', rmId, id], queryFn: () => api<Card[]>(`/api/customers/${id}/cards`, rmId) });
  const deposits = useQuery({ queryKey: ['deposits', rmId, id], queryFn: () => api<Deposit[]>(`/api/customers/${id}/deposits`, rmId) });
  const interactions = useQuery({ queryKey: ['interactions', rmId, id], queryFn: () => api<Interaction[]>(`/api/customers/${id}/interactions`, rmId) });
  const history = useQuery({ queryKey: ['analysis-history', rmId, id], queryFn: () => api<History[]>(`/api/customers/${id}/analyses`, rmId) });
  useEffect(() => { if (!selectedAnalysis && history.data?.[0]) setSelectedAnalysis(history.data[0].id); }, [history.data, selectedAnalysis]);
  useEffect(() => { setSelectedAnalysis(null); }, [id, rmId]);
  const analysis = useQuery({ queryKey: ['analysis', rmId, selectedAnalysis], queryFn: () => api<AnalysisData>(`/api/analyses/${selectedAnalysis}`, rmId), enabled: Boolean(selectedAnalysis) });
  const analyze = useMutation({
    // The analysis follows the filtered period: the Agent recomputes metrics for that window.
    mutationFn: () => api<AnalysisData>(`/api/customers/${id}/analyze`, rmId, {
      method: 'POST', body: JSON.stringify({ locale, periodFrom: from, periodTo: to }),
    }),
    onSuccess: (result) => { client.setQueryData(['analysis', rmId, result.id], result); setSelectedAnalysis(result.id); setTab('aiInsights'); void client.invalidateQueries({ queryKey: ['analysis-history', rmId, id] }); void client.invalidateQueries({ queryKey: ['dashboard', rmId] }); },
  });
  if (customer.isLoading) return <div className="skeleton h-72"/>;
  if (customer.isError || !customer.data) return <ErrorBox message={t('error')}/>;
  const c = customer.data;
  const m: CustomerMetricsAsOf | CustomerMetrics | null = metrics.data ?? c.metrics;
  const asOf = metrics.data;
  const totalAssets = summary.data ? summary.data.totalAssets.end : Number(m?.tav ?? c.financialSummary.totalAssets);
  const interactionsInPeriod = (interactions.data ?? []).filter((row) => !period || (row.interactionAt.slice(0, 10) >= from && row.interactionAt.slice(0, 10) <= to));
  const kpis: Array<[string, string | number]> = [
    [t('totalAssetValue'), totalAssets],
    [t('casa'), summary.data ? summary.data.balances.casaBalance.end : c.financialSummary.casa],
    [t('deposits'), summary.data ? summary.data.balances.fdBalance.end : c.financialSummary.deposits],
    [t('creditLimit'), c.financialSummary.creditLimit],
  ];
  return <>
    <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-bold text-navy-500 hover:text-navy-900"><ArrowLeft size={16}/>{t('customers')}</Link>
    <section className="card overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fff7ee] via-[#ffe6c9] to-[#ffc287] p-5 md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-orange-bright/25 blur-3xl"/>
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={c.fullName} size={64}/>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black md:text-3xl">{c.fullName}</h1><Badge tone="good">{c.tier}</Badge>{m && <Badge tone={churnTone(m.churnLabel)}>{churnText(m.churnLabel, t)}</Badge>}</div>
              <p className="mt-1 text-sm font-medium text-navy-700">CIF {c.customerCode} · {c.branch ?? '—'} · {t('customerSince')} {formatDay(c.customerSince.slice(0, 10), locale)}</p>
              <div className="mt-2 flex flex-wrap gap-2">{c.declaredBehaviour && <Badge>{c.declaredBehaviour}</Badge>}{c.declaredRiskAppetite && <Badge>{c.declaredRiskAppetite}</Badge>}</div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            {m && <div className="rounded-xl border border-orange-300 bg-white/70 px-4 py-3 text-right backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wider text-navy-500">{t('priorityScore')}</div>
              <div className="text-4xl font-black leading-tight text-orange-600">{m.priorityScore.toFixed(1)}</div>
              {asOf && <div className="flex items-center justify-end gap-1 text-[11px] text-navy-500">{t('computedAt')} {formatDay(asOf.asOfDate, locale)}{asOf.insufficientHistory && <AlertTriangle size={12} className="text-orange-600" aria-label={t('insufficientHistory')}/>}</div>}
            </div>}
            <button disabled={!ready || analyze.isPending} onClick={() => analyze.mutate()} className="button shrink-0"><Sparkles size={18}/>{analyze.isPending ? t('analyzing') : t('analyze')}</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 md:grid-cols-4 md:divide-y-0">{kpis.map(([label, value], index) => {
        const chip = ['bg-navy-50 text-navy-800', 'bg-orange-50 text-orange-600', 'bg-emerald-50 text-success', 'bg-red-50 text-red-600'][index] ?? 'bg-navy-50 text-navy-800';
        const Icon = [Wallet, PiggyBank, Landmark, CreditCard][index] ?? Wallet;
        return <div key={label} className="flex items-center gap-3 p-5">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${chip}`}><Icon size={18}/></div>
          <div className="min-w-0"><div className="label">{label}</div><div className="mt-1 text-xl font-black">{money(value, locale)}</div></div>
        </div>;
      })}</div>
    </section>
    {period && dataRange.data && <PeriodFilter period={period} dataRange={dataRange.data} onChange={setPeriod} locale={locale} t={t}/>}
    {asOf?.insufficientHistory && <div className="card flex items-center gap-2 border-orange-300 bg-orange-50 p-3 text-sm text-orange-600"><AlertTriangle size={16}/>{t('insufficientHistory')}</div>}
    {analyze.isPending && <Analyzing locale={locale}/>} {analyze.isError && <ErrorBox message={analyze.error.message}/>}
    <Tabs items={tabs.map((item) => ({ id: item, label: t(item) }))} value={tab} onChange={setTab}/>
    {tab === 'overview' && <Overview customer={c} metrics={m} summary={summary.data} accounts={accounts.data ?? []} interactions={interactionsInPeriod} positions={positions.data ?? []} period={period} locale={locale} t={t}/>}
    {tab === 'transactions' && <Transactions page={transactions.data} filters={txFilters} onChange={setTxFilters} loading={transactions.isLoading} locale={locale} t={t}/>}
    {tab === 'cards' && <Cards rows={cards.data ?? []} summary={summary.data} locale={locale} t={t}/>}
    {tab === 'deposits' && <Deposits rows={deposits.data ?? []} summary={summary.data} locale={locale} t={t}/>}
    {tab === 'interactions' && <Interactions rows={interactionsInPeriod} empty={t('empty')}/>}
    {tab === 'aiInsights' && <AiInsights data={analysis.data} histories={history.data ?? []} selected={selectedAnalysis} onSelect={setSelectedAnalysis} period={period} onReanalyze={() => analyze.mutate()} reanalyzing={analyze.isPending} locale={locale} t={t} rmId={rmId}/>}
  </>;
}

function Analyzing({ locale }: { locale: Locale }) {
  const steps = locale === 'vi' ? ['Đang đọc chỉ số đánh giá KH','Đang đối chiếu ma trận kịch bản MSB','Đang xem bối cảnh chăm sóc','Đang chuẩn bị khuyến nghị'] : ['Reading customer metrics','Applying the MSB scenario matrix','Reviewing customer context','Preparing recommendations'];
  return <div className="card border-orange-300 bg-orange-50/70 p-5"><div className="flex items-center gap-3 font-extrabold text-orange-600"><Bot className="animate-pulse"/>M-Link</div><div className="mt-4 grid gap-2 md:grid-cols-4">{steps.map((step) => <div key={step} className="flex items-center gap-2 text-sm text-navy-800"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500"/>{step}</div>)}</div></div>;
}

function Overview({ customer, metrics, summary, accounts, interactions, positions, period, locale, t }: { customer: Customer; metrics: CustomerMetrics | null; summary: PeriodSummary | undefined; accounts: Account[]; interactions: Interaction[]; positions: Position[]; period: Period | null; locale: Locale; t: T }) {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const trend = positions.map((row) => ({ date: fmt(row.positionDate), casa: Math.round(row.casaBalance / 1_000_000), fd: Math.round(row.fdBalance / 1_000_000), invest: Math.round((row.bondBalance + row.fundCertValue) / 1_000_000) }));
  const spending = summary ? FLOW_CATEGORIES.map((category) => ({ name: FLOW_LABELS[category][locale], value: Math.round(summary.flows[category].total / 100_000) / 10 })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 8) : [];
  return <div className="grid gap-5 lg:grid-cols-3">
    {summary && <div className="lg:col-span-3"><PeriodSummaryCard summary={summary} locale={locale} t={t}/></div>}
    {metrics && <div className="lg:col-span-2"><MetricsPanel metrics={metrics} locale={locale} t={t}/></div>}
    <div className="space-y-5">
      <HoldingMatrix holdings={customer.holdings} locale={locale} t={t}/>
      <div className="card"><div className="card-head"><h2 className="text-base font-extrabold">{t('profile')}</h2></div><dl className="space-y-3 p-5 text-sm">{[['Email',customer.email],[locale === 'vi' ? 'Điện thoại' : 'Phone',customer.phone],[t('branch'),customer.branch ?? '—'],[locale === 'vi' ? 'Mở CIF' : 'CIF opened',customer.customerSince],[locale === 'vi' ? 'Tài khoản' : 'Accounts',String(accounts.length)],[`${t('interactions')} (${t('period').toLowerCase()})`,String(interactions.length)]].map(([label,value]) => <div key={label}><dt className="text-navy-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}{customer.behaviourNote && <div><dt className="text-navy-500">{t('behaviourNote')}</dt><dd className="font-semibold">{customer.behaviourNote}</dd></div>}</dl></div>
    </div>
    <div className="card lg:col-span-2">
      <div className="card-head">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-800"><TrendingUp size={18}/></div>
          <div><p className="label">{t('balanceTrend')}</p>{period && <h2 className="mt-0.5 text-base font-extrabold">{formatDay(period.from, locale)} → {formatDay(period.to, locale)}</h2>}</div>
        </div>
        <span className="text-xs font-semibold text-navy-500">{locale === 'vi' ? 'Đơn vị: triệu đồng' : 'Unit: million VND'}</span>
      </div>
      {/* Small multiples: FD dwarfs CASA on a shared axis, so each balance gets its own scale. */}
      <div className="grid divide-y divide-navy-100 p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {TREND_SERIES.map(({ key, name, color }) => {
          const values = trend.map((row) => row[key]);
          const first = values[0] ?? 0;
          const last = values[values.length - 1] ?? 0;
          const delta = last - first;
          return <div key={key} className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-navy-800"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }}/>{name}</span>
              <span className={`text-xs font-bold ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-navy-500'}`}>{delta > 0 ? '+' : ''}{delta.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')}</span>
            </div>
            <div className="mt-0.5 text-lg font-black">{last.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')}</div>
            <div className="mt-2 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs><linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={.3}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="date" fontSize={10} interval="preserveStartEnd" minTickGap={28} tickLine={false} axisLine={false}/>
                  <YAxis fontSize={10} width={44} domain={['auto', 'auto']} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={(value: number) => [value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB'), name]}/>
                  <Area type="monotone" dataKey={key} name={name} stroke={color} fill={`url(#grad-${key})`} strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>;
        })}
      </div>
    </div>
    <div className="card"><div className="card-head"><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600"><PieChart size={18}/></div><div><p className="label">{t('spendingCategories')}</p><h2 className="mt-0.5 text-base font-extrabold">{locale === 'vi' ? 'Đơn vị: triệu đồng' : 'Unit: million VND'}</h2></div></div></div><div className="h-64 p-5">{spending.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={spending} layout="vertical"><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={120} fontSize={10}/><Tooltip/><Bar dataKey="value" name={locale === 'vi' ? 'Triệu đồng' : 'Million VND'} fill="#ea4e24" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer> : <Empty message={t('empty')}/>}</div></div>
  </div>;
}

function Transactions({ page, filters, onChange, loading, locale, t }: { page: Page<Transaction> | undefined; filters: TxFilters; onChange: (next: TxFilters) => void; loading: boolean; locale: Locale; t: T }) {
  const rows = page?.items ?? [];
  const debit = rows.filter((r) => r.type === 'DEBIT').reduce((sum, r) => sum + Number(r.amount), 0);
  const credit = rows.filter((r) => r.type === 'CREDIT').reduce((sum, r) => sum + Number(r.amount), 0);
  return <div className="space-y-4">
    <div className="card grid gap-3 p-4 md:grid-cols-[auto_200px_240px_1fr] md:items-center">
      <span className="label">{t('filterTransactions')}</span>
      <select className="field" aria-label={t('allTypes')} value={filters.type} onChange={(event) => onChange({ ...filters, type: event.target.value as TxFilters['type'], page: 1 })}><option value="">{t('allTypes')}</option><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></select>
      <select className="field" aria-label={t('allCategories')} value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value as TxFilters['category'], page: 1 })}><option value="">{t('allCategories')}</option>{FLOW_CATEGORIES.map((category) => <option key={category} value={category}>{FLOW_LABELS[category][locale]}</option>)}</select>
      <div className="text-sm text-navy-500 md:text-right">{page?.total ?? 0} {t('results')} · {t('totalDebit')} {money(debit, locale)} · {t('totalCredit')} {money(credit, locale)}</div>
    </div>
    {loading ? <div className="skeleton h-48"/> : !rows.length ? <Empty message={t('empty')}/> : <div className="card table-wrap"><table className="data-table"><thead><tr><th>{t('from')}</th><th>Description</th><th>{t('category')}</th><th>Amount</th><th>CASA after</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td>{new Date(r.transactionAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}</td><td className="font-semibold">{r.description}</td><td><Badge>{FLOW_LABELS[r.category as FlowCategory]?.[locale] ?? r.category}</Badge></td><td className={r.type==='CREDIT'?'font-bold text-success':'font-bold'}>{r.type==='CREDIT'?'+':'-'}{money(r.amount,locale)}</td><td>{money(r.balanceAfter,locale)}</td></tr>)}</tbody></table></div>}
    {page && page.totalPages > 1 && <div className="flex items-center justify-between text-sm"><button className="button secondary !py-2" disabled={filters.page <= 1} onClick={() => onChange({ ...filters, page: filters.page - 1 })}>← {t('prev')}</button><span>{t('page')} {page.page} {t('of')} {page.totalPages}</span><button className="button secondary !py-2" disabled={filters.page >= page.totalPages} onClick={() => onChange({ ...filters, page: filters.page + 1 })}>{t('next')} →</button></div>}
  </div>;
}

function Cards({ rows, summary, locale, t }: { rows: Card[]; summary: PeriodSummary | undefined; locale: Locale; t: T }) {
  if(!rows.length) return <Empty message={t('empty')}/>;
  return <div className="grid gap-4 md:grid-cols-2">{rows.map(r=><div key={r.id} className="space-y-3"><div className="card bg-gradient-to-br from-navy-900 to-navy-700 p-6 text-white"><div className="text-sm text-white/70">MSB {r.type}</div><div className="my-8 font-mono text-xl tracking-wider">{r.maskedNumber}</div><div className="flex justify-between"><div><div className="text-xs text-white/70">LIMIT</div><b>{money(r.creditLimit,locale)}</b></div><div><div className="text-xs text-white/70">AVAILABLE</div><b>{money(r.availableLimit,locale)}</b></div><div><div className="text-xs text-white/70">EXPIRY</div><b>{r.expiryDate}</b></div></div></div>{summary && <div className="card grid grid-cols-2 gap-3 p-4 text-sm"><div><div className="label">{t('cardSpendInPeriod')}</div><div className="font-bold">{money(summary.flows.CC_SPEND.total, locale)}</div><div className="text-xs text-navy-500">{summary.flows.CC_SPEND.days} {t('daysWithActivity').toLowerCase()}</div></div><div><div className="label">{t('avgBalanceInPeriod')}</div><div className="font-bold">{money(summary.balances.creditCardBalance.avg, locale)}</div><div className="text-xs text-navy-500">{t('closingBalance')}: {money(summary.balances.creditCardBalance.end, locale)}</div></div></div>}</div>)}</div>;
}

function Deposits({ rows, summary, locale, t }: { rows: Deposit[]; summary: PeriodSummary | undefined; locale: Locale; t: T }) {
  if(!rows.length) return <Empty message={t('empty')}/>;
  return <div className="grid gap-4 md:grid-cols-2">{rows.map(r=><div className="card p-5" key={r.id}><div className="flex justify-between"><h3 className="font-extrabold">{r.productName}</h3><Badge tone={r.status === 'ACTIVE' ? 'good' : 'warn'}>{r.status === 'ACTIVE' ? r.status : t('closed')}</Badge></div><div className="mt-5 text-2xl font-black">{money(r.principal,locale)}</div><div className="mt-3 flex justify-between text-sm text-navy-500"><span>{r.interestRate ? `${r.interestRate}%` : r.startDate}</span><span>{r.maturityDate ?? t('noMaturity')}</span></div>{summary && <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-navy-100 pt-3 text-sm">{[[t('openingBalance'), summary.balances.fdBalance.start],[t('closingBalance'), summary.balances.fdBalance.end],[t('averageBalance'), summary.balances.fdBalance.avg]].map(([label, value]) => <div key={label as string}><dt className="text-xs text-navy-500">{label}</dt><dd className="font-bold">{money(value as number, locale)}</dd></div>)}</dl>}</div>)}</div>;
}

function Interactions({ rows, empty }: { rows:Interaction[]; empty:string }) { if(!rows.length)return <Empty message={empty}/>; return <div className="space-y-3">{rows.map(r=><div className="card flex gap-4 p-5" key={r.id}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50"><MessageSquareText size={18}/></div><div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-extrabold">{r.subject}</h3><Badge tone={r.sentiment==='NEGATIVE'?'danger':r.sentiment==='POSITIVE'?'good':'neutral'}>{r.sentiment}</Badge></div><p className="mt-1 text-sm text-navy-500">{r.summary}</p><div className="mt-2 text-xs text-navy-500">{r.channel} · {new Date(r.interactionAt).toLocaleString()} · {r.status}</div></div></div>)}</div>; }

function AiInsights({ data, histories, selected, onSelect, period, onReanalyze, reanalyzing, locale, t, rmId }: { data: AnalysisData|undefined; histories: History[]; selected:string|null; onSelect:(id:string)=>void; period: Period|null; onReanalyze:()=>void; reanalyzing:boolean; locale: Locale; t: T; rmId:string }) {
  const client=useQueryClient();
  const analysed = data?.period ?? null;
  const ignored = data?.periodApplied === false;
  const stale = Boolean(analysed && period && (analysed.from !== period.from || analysed.to !== period.to));
  const periodText = (value: AnalysisPeriod | null) => value ? `${formatDay(value.from, locale)} → ${formatDay(value.to, locale)} · ${value.windowDays} ${t('daysUnit')}` : t('fullPeriod');
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const statusMeta: Record<string, { tone: 'good' | 'warn' | 'danger' | 'neutral'; label: string }> = {
    COMPLETED: { tone: 'good', label: t('statusCompleted') }, RUNNING: { tone: 'warn', label: t('statusRunning') },
    PENDING: { tone: 'neutral', label: t('statusPending') }, FAILED: { tone: 'danger', label: t('statusFailed') },
    TIMEOUT: { tone: 'danger', label: t('statusTimeout') },
  };
  const feedback=useMutation({mutationFn:({id,status,useful}:{id:string;status:string;useful:boolean|null})=>api(`/api/recommendations/${id}/feedback`,rmId,{method:'POST',body:JSON.stringify({status,useful})}),onSuccess:()=>void client.invalidateQueries({queryKey:['analysis',rmId,selected]})});
  if(!data?.analysis) return <Empty message={t('empty')}/>;
  const {analysis}=data; const care=!analysis.guardrail.sellAllowed; const noAction=!care&&!data.recommendations.length;
  return <div className="grid gap-5 lg:grid-cols-[1fr_290px]"><div className="space-y-5">
    <div className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${ignored ? 'border-red-300 bg-red-50' : stale ? 'border-orange-300 bg-orange-50' : ''}`}>
      <div><div className="label">{t('analysisPeriod')}</div><div className="font-bold">{periodText(analysed)}</div>
        {ignored && <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-red-900"><AlertOctagon size={15}/>{t('agentIgnoredPeriod')}</div>}
        {!ignored && stale && <div className="mt-1 text-sm text-orange-600">{t('staleAnalysisPeriod')}</div>}
      </div>
      {stale && !ignored && <button disabled={reanalyzing} onClick={onReanalyze} className="button secondary !py-2 text-sm"><Sparkles size={16}/>{reanalyzing ? t('analyzing') : t('reanalyze')}</button>}
    </div>
    {care&&<div className="card border-red-300 bg-red-50 p-6"><div className="flex items-center gap-3 text-red-800"><AlertOctagon size={28}/><div><div className="label !text-red-700">{t('careFirst')}</div><h2 className="text-2xl font-black">{t('doNotSell')}</h2></div></div><p className="mt-4 font-semibold text-red-900">{analysis.guardrail.reason}</p></div>}
    {noAction&&<div className="card border-emerald-200 bg-emerald-50/70 p-6"><div className="flex items-center gap-3 text-success"><CheckCircle2 size={28}/><h2 className="text-2xl font-black">{t('noAction')}</h2></div><p className="mt-3 text-navy-500">{analysis.summary.overview}</p><p className="mt-2 font-bold">{t('doNotDisturb')}</p></div>}
    <div className="card p-6"><div className="flex items-start justify-between gap-4"><div><div className="label">{t('summary')}</div><h2 className="mt-2 text-xl font-extrabold capitalize">{analysis.summary.relationshipStatus.replaceAll('_',' ')}</h2></div><div className="grid h-16 w-16 place-items-center rounded-full bg-orange-50 text-xl font-black text-orange-600">{Math.round(analysis.summary.opportunityScore)}</div></div><p className="mt-4 text-navy-500">{analysis.summary.overview}</p></div>
    {!!analysis.signals.length&&<div className="card p-6"><h2 className="font-extrabold">{t('signals')}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{analysis.signals.map(s=><div key={s.type} className="rounded-xl border border-navy-100 p-4"><div className="flex justify-between"><b>{s.title}</b><Badge tone={s.severity==='high'?'danger':s.severity==='medium'?'warn':'neutral'}>{s.severity.toUpperCase()}</Badge></div><p className="mt-2 text-sm text-navy-500">{s.description}</p><div className="mt-3 text-xs font-bold text-navy-800">{Math.round(s.confidence*100)}% {t('confidence').toLowerCase()}</div></div>)}</div></div>}
    {data.recommendations.map(rec=><div className="card overflow-hidden" key={rec.id}><div className="border-b border-navy-100 bg-orange-50 p-5"><div className="label">#{rec.priority} · {t('nextBestAction')}</div><h2 className="mt-2 text-xl font-black">{rec.title}</h2><div className="mt-2 flex gap-2"><Badge tone="good">{Math.round(rec.confidence*100)}% {t('confidence')}</Badge>{rec.product&&<Badge>{rec.product.name}</Badge>}</div></div><div className="space-y-5 p-5"><p className="text-navy-500">{rec.description}</p><div><h3 className="flex items-center gap-2 font-extrabold"><Lightbulb size={17}/>{t('why')}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-500">{rec.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div><details className="rounded-xl border border-navy-100 p-4"><summary className="cursor-pointer font-bold">{t('evidence')}</summary><div className="mt-3 space-y-3">{rec.evidence.map(e=><div key={e.id}><b className="text-sm">{e.title}</b><p className="text-sm text-navy-500">{e.description}</p></div>)}</div></details><div className="flex flex-wrap gap-2 border-t border-navy-100 pt-4">{[[t('useful'),'CONTACTED',true],[t('notRelevant'),'NOT_RELEVANT',false],[t('contacted'),'CONTACTED',null],[t('interested'),'INTERESTED',true],[t('rejected'),'REJECTED',null]].map(([label,status,useful],index)=><button disabled={feedback.isPending} onClick={()=>feedback.mutate({id:rec.id,status:status as string,useful:useful as boolean|null})} className="button secondary !py-2 text-sm" key={`${status}-${index}`}>{label as string}</button>)}</div></div></div>)}
  </div><aside className="card h-fit p-5"><h2 className="flex items-center gap-2 font-extrabold"><Clock3 size={18}/>{t('history')}</h2><div className="mt-4 space-y-2">{histories.map(h=>{const meta=statusMeta[h.status]??{tone:'neutral' as const,label:h.status};return <button key={h.id} onClick={()=>onSelect(h.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected===h.id?'border-orange-500 bg-orange-50':'border-navy-100 hover:bg-navy-50'}`}><div className="flex items-center justify-between gap-2"><Badge tone={meta.tone}>{meta.label}</Badge><span className="text-xs text-navy-500">{formatDateTime(h.createdAt)}</span></div><div className="mt-2 text-sm font-bold text-navy-900">{periodText(h.period)}</div>{h.latencyMs!=null&&<div className="mt-1 text-xs text-navy-500">{t('processingTime')}: {(h.latencyMs/1000).toFixed(1)}s</div>}</button>;})}</div></aside></div>;
}
