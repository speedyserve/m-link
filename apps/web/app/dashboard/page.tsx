'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { RbQueueItem } from '@mlink/contracts';
import { AlertTriangle, ArrowRight, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { churnText, churnTone } from '@/components/metrics-panel';
import { useApp } from '@/components/providers';
import { Badge, Empty, ErrorBox, LoadingCards } from '@/components/ui';
import { api } from '@/lib/api';

type Dashboard = {
  portfolio: { customerCount: number; needAttention: number; highPriority: number; customerCare: number };
  priorityCustomers: RbQueueItem[];
};

export default function DashboardPage() {
  const { rmId, t } = useApp();
  const query = useQuery({ queryKey: ['dashboard', rmId], queryFn: () => api<Dashboard>('/api/dashboard', rmId) });
  const cards = query.data ? [
    { label: t('totalCustomers'), value: query.data.portfolio.customerCount, icon: Users, color: 'bg-navy-50 text-navy-800' },
    { label: t('needAttention'), value: query.data.portfolio.needAttention, icon: AlertTriangle, color: 'bg-orange-50 text-orange-600' },
    { label: t('highPriority'), value: query.data.portfolio.highPriority, icon: Sparkles, color: 'bg-navy-100 text-navy-900' },
    { label: t('customerCare'), value: query.data.portfolio.customerCare, icon: HeartHandshake, color: 'bg-red-50 text-red-700' },
  ] : [];
  return <div className="space-y-7">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="label">M-Link Intelligence</p><h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{t('welcome')}</h1><p className="mt-2 text-navy-500">{t('portfolio')} · {rmId}</p></div>
      <Link href="/customers" className="button">{t('search')} <ArrowRight size={17}/></Link>
    </section>
    {query.isLoading ? <LoadingCards/> : query.isError ? <ErrorBox message={t('error')}/> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon, color }) => <div key={label} className="card p-5"><div className={`mb-5 grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={20}/></div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-sm text-navy-500">{label}</div></div>)}</div>}
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-navy-100 p-5"><div><p className="label">M-Link Radar</p><h2 className="mt-1 text-xl font-extrabold">{t('rbQueue')}</h2></div><Link href="/customers" className="text-sm font-bold text-navy-800">{t('customers')} →</Link></div>
      {!query.data?.priorityCustomers.length ? <div className="p-5"><Empty message={t('empty')}/></div> : <div className="divide-y divide-navy-100">{query.data.priorityCustomers.map((customer, index) => <Link href={`/customers/${customer.customerId}`} key={customer.customerId} className="grid gap-3 p-5 transition hover:bg-orange-50/60 md:grid-cols-[auto_1.2fr_1fr_2fr_auto] md:items-center"><div className="text-sm font-black text-navy-500">#{index + 1}</div><div><div className="font-extrabold">{customer.customerName}</div><div className="mt-1 text-xs text-navy-500">CIF {customer.customerId} · {customer.tier}</div></div><div className="flex flex-wrap gap-2">{customer.sellAllowed ? <Badge tone={churnTone(customer.churnLabel)}>{churnText(customer.churnLabel, t)}</Badge> : <Badge tone="danger">{t('doNotSell')}</Badge>}</div><div><div className="font-semibold">{customer.recommendedAction}</div><div className="mt-1 text-sm text-navy-500">{customer.reason}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-2xl font-black text-orange-600">{customer.priorityScore.toFixed(1)}</div><div className="text-[10px] uppercase tracking-wide text-navy-500">{t('priorityScore')}</div></div><ArrowRight size={18}/></div></Link>)}</div>}
    </section>
  </div>;
}
