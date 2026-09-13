'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, ArrowLeft, Bot, CheckCircle2, Clock3, Lightbulb, MessageSquareText, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/components/providers';
import { Badge, Empty, ErrorBox } from '@/components/ui';
import { api, money } from '@/lib/api';

type Customer = { id: string; customerCode: string; fullName: string; segment: string; relationshipStatus: string; customerSince: string; dateOfBirth: string; email: string; phone: string; occupation: string; financialSummary: { totalAssets: string; casa: string; deposits: string; creditLimit: string } };
type Account = { id: string; accountNumber: string; type: string; currency: string; balance: string; availableBalance: string; status: string };
type Transaction = { id: string; transactionCode: string; type: string; category: string; amount: string; description: string; merchant: string | null; transactionAt: string; balanceAfter: string };
type Card = { id: string; maskedNumber: string; type: string; creditLimit: string; availableLimit: string; status: string; expiryDate: string };
type Deposit = { id: string; productName: string; principal: string; interestRate: string; maturityDate: string; status: string };
type Interaction = { id: string; channel: string; type: string; sentiment: string; subject: string; summary: string; status: string; interactionAt: string };
type Page<T> = { items: T[]; total: number };
type History = { id: string; provider: string; status: string; createdAt: string; latencyMs: number | null; error: { code: string; message: string } | null };
type AnalysisData = {
  id: string; provider: string; status: string; latencyMs: number | null; createdAt: string;
  analysis: null | { summary: { relationshipStatus: string; opportunityScore: number; overview: string }; signals: Array<{ type: string; title: string; severity: string; confidence: number; description: string }>; guardrail: { sellAllowed: boolean; reason: string | null } };
  recommendations: Array<{ id: string; priority: number; title: string; description: string; confidence: number; product: { id: string; name: string } | null; reasons: string[]; script: string; evidence: Array<{ id: string; title: string; description: string; sourceReference: string | null }> }>;
};

const tabs = ['overview', 'transactions', 'cards', 'deposits', 'interactions', 'aiInsights'] as const;
type Tab = typeof tabs[number];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { rmId, locale, t } = useApp();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const customer = useQuery({ queryKey: ['customer', rmId, id], queryFn: () => api<Customer>(`/api/customers/${id}`, rmId) });
  const accounts = useQuery({ queryKey: ['accounts', rmId, id], queryFn: () => api<Account[]>(`/api/customers/${id}/accounts`, rmId) });
  const transactions = useQuery({ queryKey: ['transactions', rmId, id], queryFn: () => api<Page<Transaction>>(`/api/customers/${id}/transactions?limit=100`, rmId) });
  const cards = useQuery({ queryKey: ['cards', rmId, id], queryFn: () => api<Card[]>(`/api/customers/${id}/cards`, rmId) });
  const deposits = useQuery({ queryKey: ['deposits', rmId, id], queryFn: () => api<Deposit[]>(`/api/customers/${id}/deposits`, rmId) });
  const interactions = useQuery({ queryKey: ['interactions', rmId, id], queryFn: () => api<Interaction[]>(`/api/customers/${id}/interactions`, rmId) });
  const history = useQuery({ queryKey: ['analysis-history', rmId, id], queryFn: () => api<History[]>(`/api/customers/${id}/analyses`, rmId) });
  useEffect(() => { if (!selectedAnalysis && history.data?.[0]) setSelectedAnalysis(history.data[0].id); }, [history.data, selectedAnalysis]);
  useEffect(() => { setSelectedAnalysis(null); }, [id, rmId]);
  const analysis = useQuery({ queryKey: ['analysis', rmId, selectedAnalysis], queryFn: () => api<AnalysisData>(`/api/analyses/${selectedAnalysis}`, rmId), enabled: Boolean(selectedAnalysis) });
  const analyze = useMutation({
    mutationFn: () => api<AnalysisData>(`/api/customers/${id}/analyze`, rmId, { method: 'POST', body: JSON.stringify({ locale }) }),
    onSuccess: (result) => { client.setQueryData(['analysis', rmId, result.id], result); setSelectedAnalysis(result.id); setTab('aiInsights'); void client.invalidateQueries({ queryKey: ['analysis-history', rmId, id] }); void client.invalidateQueries({ queryKey: ['dashboard', rmId] }); },
  });
  if (customer.isLoading) return <div className="skeleton h-72"/>;
  if (customer.isError || !customer.data) return <ErrorBox message={t('error')}/>;
  const c = customer.data;
  return <div className="space-y-6">
    <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-700"><ArrowLeft size={16}/>{t('customers')}</Link>
    <section className="card overflow-hidden"><div className="bg-gradient-to-r from-emerald-950 to-emerald-700 p-6 text-white md:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><div className="mb-3 flex gap-2"><Badge tone="good">{c.segment}</Badge><span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">{c.relationshipStatus}</span></div><h1 className="text-3xl font-black md:text-4xl">{c.fullName}</h1><p className="mt-2 text-emerald-100">{c.customerCode} · {t('customer360')}</p></div><button disabled={analyze.isPending} onClick={() => analyze.mutate()} className="button !bg-white !text-emerald-900"><Sparkles size={18}/>{analyze.isPending ? t('analyzing') : t('analyze')}</button></div></div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">{[
        [t('totalAssets'), c.financialSummary.totalAssets], [t('casa'), c.financialSummary.casa], [t('deposits'), c.financialSummary.deposits], [t('creditLimit'), c.financialSummary.creditLimit],
      ].map(([label,value]) => <div key={label} className="p-5"><div className="label">{label}</div><div className="mt-2 text-xl font-black">{money(value, locale)}</div></div>)}</div>
    </section>
    {analyze.isPending && <Analyzing locale={locale}/>} {analyze.isError && <ErrorBox message={analyze.error.message}/>} 
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1.5 shadow-sm">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold ${tab === item ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-emerald-50'}`}>{t(item)}</button>)}</div>
    {tab === 'overview' && <Overview customer={c} accounts={accounts.data ?? []} transactions={transactions.data?.items ?? []} interactions={interactions.data ?? []} locale={locale} t={t}/>} 
    {tab === 'transactions' && <Transactions rows={transactions.data?.items ?? []} locale={locale} empty={t('empty')}/>} 
    {tab === 'cards' && <Cards rows={cards.data ?? []} locale={locale} empty={t('empty')}/>} 
    {tab === 'deposits' && <Deposits rows={deposits.data ?? []} locale={locale} empty={t('empty')}/>} 
    {tab === 'interactions' && <Interactions rows={interactions.data ?? []} empty={t('empty')}/>} 
    {tab === 'aiInsights' && <AiInsights data={analysis.data} histories={history.data ?? []} selected={selectedAnalysis} onSelect={setSelectedAnalysis} t={t} rmId={rmId}/>} 
  </div>;
}

function Analyzing({ locale }: { locale: 'vi' | 'en' }) {
  const steps = locale === 'vi' ? ['Đang xem hồ sơ khách hàng','Đang xem hoạt động tài chính','Đang xem bối cảnh chăm sóc','Đang chuẩn bị khuyến nghị'] : ['Reviewing customer profile','Reviewing financial activity','Reviewing customer context','Preparing recommendations'];
  return <div className="card border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3 font-extrabold text-emerald-900"><Bot className="animate-pulse"/>M-Link</div><div className="mt-4 grid gap-2 md:grid-cols-4">{steps.map((step) => <div key={step} className="flex items-center gap-2 text-sm text-emerald-800"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>{step}</div>)}</div></div>;
}

function Overview({ customer, accounts, transactions, interactions, locale, t }: { customer: Customer; accounts: Account[]; transactions: Transaction[]; interactions: Interaction[]; locale: 'vi'|'en'; t: ReturnType<typeof useApp>['t'] }) {
  const trend = [...transactions].slice(0, 14).reverse().map((row) => ({ date: new Date(row.transactionAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day:'2-digit', month:'2-digit' }), balance: Number(row.balanceAfter) / 1_000_000 }));
  const categoryMap = transactions.reduce<Record<string,number>>((map,row) => { if(row.type === 'DEBIT') map[row.category]=(map[row.category]??0)+Number(row.amount)/1_000_000; return map; },{});
  const categories = Object.entries(categoryMap).map(([name,value]) => ({ name, value })).slice(0,7);
  return <div className="grid gap-5 lg:grid-cols-3"><div className="card p-5 lg:col-span-2"><h2 className="font-extrabold">90-day balance trend</h2><div className="mt-5 h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="balance" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#087f5b" stopOpacity={.35}/><stop offset="95%" stopColor="#087f5b" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" fontSize={11}/><YAxis fontSize={11} unit="M"/><Tooltip/><Area type="monotone" dataKey="balance" stroke="#087f5b" fill="url(#balance)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></div><div className="card p-5"><h2 className="font-extrabold">Spending categories</h2><div className="mt-5 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical"><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={80} fontSize={10}/><Tooltip/><Bar dataKey="value" fill="#25a97b" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div></div><div className="card p-5"><h2 className="font-extrabold">Profile</h2><dl className="mt-4 space-y-3 text-sm">{[['Email',customer.email],['Phone',customer.phone],['Occupation',customer.occupation],['Customer since',customer.customerSince],['Accounts',String(accounts.length)],['Interactions',String(interactions.length)]].map(([label,value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></div><div className="card p-5 lg:col-span-2"><h2 className="font-extrabold">{t('recentTransactions')}</h2><div className="mt-3 divide-y">{transactions.slice(0,4).map((row) => <div className="flex justify-between py-3" key={row.id}><div><div className="font-semibold">{row.description}</div><div className="text-xs text-slate-500">{row.category}</div></div><div className={`font-bold ${row.type === 'CREDIT' ? 'text-emerald-700' : ''}`}>{row.type === 'CREDIT' ? '+' : '-'}{money(row.amount,locale)}</div></div>)}</div></div></div>;
}

function Transactions({ rows, locale, empty }: { rows: Transaction[]; locale:'vi'|'en'; empty:string }) { if(!rows.length) return <Empty message={empty}/>; return <div className="card table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Balance</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td>{new Date(r.transactionAt).toLocaleDateString()}</td><td className="font-semibold">{r.description}</td><td><Badge>{r.category}</Badge></td><td className={r.type==='CREDIT'?'font-bold text-emerald-700':'font-bold'}>{r.type==='CREDIT'?'+':'-'}{money(r.amount,locale)}</td><td>{money(r.balanceAfter,locale)}</td></tr>)}</tbody></table></div>; }
function Cards({ rows, locale, empty }: { rows: Card[]; locale:'vi'|'en'; empty:string }) { if(!rows.length)return <Empty message={empty}/>; return <div className="grid gap-4 md:grid-cols-2">{rows.map(r=><div className="card bg-gradient-to-br from-slate-900 to-emerald-900 p-6 text-white" key={r.id}><div className="text-sm text-emerald-200">M-Link {r.type}</div><div className="my-8 font-mono text-xl tracking-wider">{r.maskedNumber}</div><div className="flex justify-between"><div><div className="text-xs text-emerald-200">LIMIT</div><b>{money(r.creditLimit,locale)}</b></div><div><div className="text-xs text-emerald-200">EXPIRY</div><b>{r.expiryDate}</b></div></div></div>)}</div>; }
function Deposits({ rows, locale, empty }: { rows: Deposit[]; locale:'vi'|'en'; empty:string }) { if(!rows.length)return <Empty message={empty}/>; return <div className="grid gap-4 md:grid-cols-2">{rows.map(r=><div className="card p-5" key={r.id}><div className="flex justify-between"><h3 className="font-extrabold">{r.productName}</h3><Badge tone="good">{r.status}</Badge></div><div className="mt-5 text-2xl font-black">{money(r.principal,locale)}</div><div className="mt-3 flex justify-between text-sm text-slate-500"><span>{r.interestRate}%</span><span>{r.maturityDate}</span></div></div>)}</div>; }
function Interactions({ rows, empty }: { rows:Interaction[]; empty:string }) { if(!rows.length)return <Empty message={empty}/>; return <div className="space-y-3">{rows.map(r=><div className="card flex gap-4 p-5" key={r.id}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100"><MessageSquareText size={18}/></div><div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-extrabold">{r.subject}</h3><Badge tone={r.sentiment==='NEGATIVE'?'danger':'neutral'}>{r.sentiment}</Badge></div><p className="mt-1 text-sm text-slate-600">{r.summary}</p><div className="mt-2 text-xs text-slate-400">{r.channel} · {new Date(r.interactionAt).toLocaleString()} · {r.status}</div></div></div>)}</div>; }

function AiInsights({ data, histories, selected, onSelect, t, rmId }: { data: AnalysisData|undefined; histories: History[]; selected:string|null; onSelect:(id:string)=>void; t:ReturnType<typeof useApp>['t']; rmId:string }) {
  const client=useQueryClient();
  const feedback=useMutation({mutationFn:({id,status,useful}:{id:string;status:string;useful:boolean|null})=>api(`/api/recommendations/${id}/feedback`,rmId,{method:'POST',body:JSON.stringify({status,useful})}),onSuccess:()=>void client.invalidateQueries({queryKey:['analysis',rmId,selected]})});
  if(!data?.analysis) return <Empty message={t('empty')}/>;
  const {analysis}=data; const care=!analysis.guardrail.sellAllowed; const noAction=!care&&!data.recommendations.length;
  return <div className="grid gap-5 lg:grid-cols-[1fr_290px]"><div className="space-y-5">
    {care&&<div className="card border-rose-300 bg-rose-50 p-6"><div className="flex items-center gap-3 text-rose-800"><AlertOctagon size={28}/><div><div className="label !text-rose-700">{t('careFirst')}</div><h2 className="text-2xl font-black">{t('doNotSell')}</h2></div></div><p className="mt-4 font-semibold text-rose-900">{analysis.guardrail.reason}</p></div>}
    {noAction&&<div className="card border-slate-300 bg-slate-50 p-6"><div className="flex items-center gap-3"><CheckCircle2 size={28}/><h2 className="text-2xl font-black">{t('noAction')}</h2></div><p className="mt-3 text-slate-600">{analysis.summary.overview}</p><p className="mt-2 font-bold">{t('doNotDisturb')}</p></div>}
    <div className="card p-6"><div className="flex items-start justify-between gap-4"><div><div className="label">{t('summary')}</div><h2 className="mt-2 text-xl font-extrabold capitalize">{analysis.summary.relationshipStatus.replaceAll('_',' ')}</h2></div><div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-xl font-black text-emerald-700">{analysis.summary.opportunityScore}</div></div><p className="mt-4 text-slate-600">{analysis.summary.overview}</p></div>
    {!!analysis.signals.length&&<div className="card p-6"><h2 className="font-extrabold">{t('signals')}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{analysis.signals.map(s=><div key={s.type} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><b>{s.title}</b><Badge tone={s.severity==='high'?'danger':'warn'}>{s.severity.toUpperCase()}</Badge></div><p className="mt-2 text-sm text-slate-600">{s.description}</p><div className="mt-3 text-xs font-bold text-emerald-700">{Math.round(s.confidence*100)}% {t('confidence').toLowerCase()}</div></div>)}</div></div>}
    {data.recommendations.map(rec=><div className="card overflow-hidden" key={rec.id}><div className="border-b border-slate-100 bg-emerald-50 p-5"><div className="label">#{rec.priority} · {t('nextBestAction')}</div><h2 className="mt-2 text-xl font-black">{rec.title}</h2><div className="mt-2 flex gap-2"><Badge tone="good">{Math.round(rec.confidence*100)}% {t('confidence')}</Badge>{rec.product&&<Badge>{rec.product.name}</Badge>}</div></div><div className="space-y-5 p-5"><p className="text-slate-600">{rec.description}</p><div><h3 className="flex items-center gap-2 font-extrabold"><Lightbulb size={17}/>{t('why')}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{rec.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div><details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">{t('evidence')}</summary><div className="mt-3 space-y-3">{rec.evidence.map(e=><div key={e.id}><b className="text-sm">{e.title}</b><p className="text-sm text-slate-500">{e.description} {e.sourceReference&&`· ${e.sourceReference}`}</p></div>)}</div></details>{rec.script&&<div className="rounded-xl bg-slate-50 p-4"><div className="label">{t('suggestedScript')}</div><p className="mt-2 italic text-slate-700">“{rec.script}”</p></div>}<div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">{[[t('useful'),'CONTACTED',true],[t('notRelevant'),'NOT_RELEVANT',false],[t('contacted'),'CONTACTED',null],[t('interested'),'INTERESTED',true],[t('rejected'),'REJECTED',null]].map(([label,status,useful],index)=><button disabled={feedback.isPending} onClick={()=>feedback.mutate({id:rec.id,status:status as string,useful:useful as boolean|null})} className="button secondary !py-2 text-sm" key={`${status}-${index}`}>{label as string}</button>)}</div></div></div>)}
  </div><aside className="card h-fit p-5"><h2 className="flex items-center gap-2 font-extrabold"><Clock3 size={18}/>{t('history')}</h2><div className="mt-4 space-y-2">{histories.map(h=><button key={h.id} onClick={()=>onSelect(h.id)} className={`w-full rounded-xl border p-3 text-left ${selected===h.id?'border-emerald-500 bg-emerald-50':'border-slate-200'}`}><div className="flex justify-between"><b className="text-sm">{h.provider}</b><Badge tone={h.status==='COMPLETED'?'good':'danger'}>{h.status}</Badge></div><div className="mt-2 text-xs text-slate-500">{new Date(h.createdAt).toLocaleString()} {h.latencyMs!=null&&`· ${(h.latencyMs/1000).toFixed(1)}s`}</div></button>)}</div></aside></div>;
}
