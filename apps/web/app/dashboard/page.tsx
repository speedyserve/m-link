'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RbQueueItem } from '@mlink/contracts';
import { AlertTriangle, ArrowRight, ChevronRight, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { churnText, churnTone } from '@/components/metrics-panel';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Empty, ErrorBox, LoadingCards, PageHeader, StatTile } from '@/components/ui';
import { api } from '@/lib/api';

type Dashboard = {
  portfolio: { customerCount: number; needAttention: number; highPriority: number; customerCare: number };
  priorityCustomers: RbQueueItem[];
};
type Filter = 'all' | 'attention' | 'care';

export default function DashboardPage() {
  const { rmId, t } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({ queryKey: ['dashboard', rmId], queryFn: () => api<Dashboard>('/api/dashboard', rmId) });
  const queue = query.data?.priorityCustomers ?? [];
  const visible = queue.filter((item) => filter === 'all' || (filter === 'care' ? !item.sellAllowed : item.sellAllowed && item.churnLabel !== 'Thấp'));
  const filters: Array<[Filter, string]> = [['all', t('all')], ['attention', t('needAttention')], ['care', t('customerCare')]];

  return <>
    <PageHeader
      eyebrow="M-Link Intelligence"
      title={t('welcome')}
      description={`${t('portfolio')} · ${rmId}`}
      actions={<Link href="/customers" className="button">{t('customers')} <ArrowRight size={16}/></Link>}
    />
    {query.isLoading ? <LoadingCards/> : query.isError ? <ErrorBox message={t('error')}/> : query.data && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label={t('totalCustomers')} value={query.data.portfolio.customerCount} icon={Users}/>
      <StatTile label={t('needAttention')} value={query.data.portfolio.needAttention} icon={AlertTriangle} tone="orange"/>
      <StatTile label={t('highPriority')} value={query.data.portfolio.highPriority} icon={Sparkles}/>
      <StatTile label={t('customerCare')} value={query.data.portfolio.customerCare} icon={HeartHandshake} tone="danger"/>
    </div>}
    <section className="card overflow-hidden">
      <div className="card-head">
        <div><p className="label">M-Link Radar</p><h2 className="mt-0.5 text-lg font-extrabold">{t('rbQueue')}</h2></div>
        <div className="segmented" role="group" aria-label={t('rbQueue')}>{filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
      </div>
      {!visible.length ? <div className="p-5"><Empty message={t('empty')}/></div> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th className="w-12">#</th><th>{t('customers')}</th><th>{t('churnRisk')}</th><th>{t('recommendedAction')}</th><th>{t('priorityScore')}</th><th aria-label={t('viewCustomer')}/></tr></thead>
        <tbody>{visible.map((customer, index) => <tr key={customer.customerId} className="row-link" onClick={() => router.push(`/customers/${customer.customerId}`)}>
          <td className="font-black text-navy-500">{index + 1}</td>
          <td><div className="flex items-center gap-3"><Avatar name={customer.customerName} size={36}/><div><Link href={`/customers/${customer.customerId}`} className="font-extrabold hover:text-orange-600" onClick={(event) => event.stopPropagation()}>{customer.customerName}</Link><div className="text-xs text-navy-500">CIF {customer.customerId} · {customer.tier}</div></div></div></td>
          <td>{customer.sellAllowed ? <Badge tone={churnTone(customer.churnLabel)}>{churnText(customer.churnLabel, t)}</Badge> : <Badge tone="danger">{t('doNotSell')}</Badge>}</td>
          <td className="min-w-[18rem] max-w-md whitespace-normal"><div className="font-semibold">{customer.recommendedAction}</div>{customer.reason !== customer.recommendedAction && <div className="mt-0.5 text-xs text-navy-500">{customer.reason}</div>}</td>
          <td><div className="flex items-center gap-3"><span className="w-10 text-lg font-black text-orange-600">{customer.priorityScore.toFixed(1)}</span><div className="h-1.5 w-24 rounded-full bg-navy-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, customer.priorityScore))}%` }}/></div></div></td>
          <td className="text-right text-navy-500"><ChevronRight size={18} className="inline"/></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
