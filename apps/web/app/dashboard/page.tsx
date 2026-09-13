'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Badge, Empty, ErrorBox, LoadingCards } from '@/components/ui';
import { api } from '@/lib/api';

type Dashboard = {
  portfolio: { customerCount: number; needAttention: number; highPriority: number; customerCare: number };
  priorityCustomers: Array<{ customerId: string; customerName: string; segment: string; reason: string; priorityScore: number; recommendedAction: string; sellAllowed: boolean }>;
};

export default function DashboardPage() {
  const { rmId, t } = useApp();
  const query = useQuery({ queryKey: ['dashboard', rmId], queryFn: () => api<Dashboard>('/api/dashboard', rmId) });
  const cards = query.data ? [
    { label: t('totalCustomers'), value: query.data.portfolio.customerCount, icon: Users, color: 'bg-emerald-50 text-emerald-700' },
    { label: t('needAttention'), value: query.data.portfolio.needAttention, icon: AlertTriangle, color: 'bg-amber-50 text-amber-700' },
    { label: t('highPriority'), value: query.data.portfolio.highPriority, icon: Sparkles, color: 'bg-indigo-50 text-indigo-700' },
    { label: t('customerCare'), value: query.data.portfolio.customerCare, icon: HeartHandshake, color: 'bg-rose-50 text-rose-700' },
  ] : [];
  return <div className="space-y-7">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="label">M-Link Intelligence</p><h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{t('welcome')}</h1><p className="mt-2 text-slate-500">{t('portfolio')} · {rmId}</p></div>
      <Link href="/customers" className="button">{t('search')} <ArrowRight size={17}/></Link>
    </section>
    {query.isLoading ? <LoadingCards/> : query.isError ? <ErrorBox message={t('error')}/> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon, color }) => <div key={label} className="card p-5"><div className={`mb-5 grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={20}/></div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-sm text-slate-500">{label}</div></div>)}</div>}
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="label">M-Link Radar</p><h2 className="mt-1 text-xl font-extrabold">{t('priorityCustomers')}</h2></div><Link href="/customers" className="text-sm font-bold text-emerald-700">{t('customers')} →</Link></div>
      {!query.data?.priorityCustomers.length ? <div className="p-5"><Empty message={t('empty')}/></div> : <div className="divide-y divide-slate-100">{query.data.priorityCustomers.map((customer) => <Link href={`/customers/${customer.customerId}`} key={customer.customerId} className="grid gap-3 p-5 transition hover:bg-emerald-50/40 md:grid-cols-[1.2fr_.8fr_2fr_auto] md:items-center"><div><div className="font-extrabold">{customer.customerName}</div><div className="mt-1 text-xs text-slate-500">{customer.customerId}</div></div><div><Badge tone={customer.sellAllowed ? 'good' : 'danger'}>{customer.sellAllowed ? customer.segment : t('doNotSell')}</Badge></div><div><div className="font-semibold">{customer.recommendedAction}</div><div className="mt-1 text-sm text-slate-500">{customer.reason}</div></div><div className="flex items-center gap-3"><span className="text-2xl font-black text-emerald-700">{customer.priorityScore}</span><ArrowRight size={18}/></div></Link>)}</div>}
    </section>
  </div>;
}

