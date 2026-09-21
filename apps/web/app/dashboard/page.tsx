'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RbQueueItem, SuggestionCode } from '@mlink/contracts';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, ChevronRight, Gauge, HeartHandshake, Layers, Lightbulb, Radar, ShieldAlert, Sparkles, Target, Users } from 'lucide-react';
import { SUGGESTION_TEXT, churnText, churnTone } from '@/components/metrics-panel';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Empty, ErrorBox, Hero, LoadingCards, SectionHead, StatTile } from '@/components/ui';
import { api } from '@/lib/api';

type Dashboard = {
  portfolio: { customerCount: number; needAttention: number; highPriority: number; customerCare: number };
  priorityCustomers: RbQueueItem[];
};
type Filter = 'all' | 'attention' | 'care';

// Status colors are reserved for churn risk (good/warn/danger) — never reused as generic series colors.
const CHURN_COLORS = { good: '#157f4d', warn: '#ea4e24', danger: '#ef4444' };

export default function DashboardPage() {
  const { rmId, rmName, locale, t } = useApp();
  const vi = locale === 'vi';
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({ queryKey: ['dashboard', rmId], queryFn: () => api<Dashboard>('/api/dashboard', rmId) });
  const queue = useMemo(() => query.data?.priorityCustomers ?? [], [query.data]);
  const visible = queue.filter((item) => filter === 'all' || (filter === 'care' ? !item.sellAllowed : item.sellAllowed && item.churnLabel !== 'Thấp'));
  const filters: Array<[Filter, string]> = [['all', t('all')], ['attention', t('needAttention')], ['care', t('customerCare')]];

  const insight = useMemo(() => {
    if (!queue.length) return null;
    const avgPriority = queue.reduce((sum, c) => sum + c.priorityScore, 0) / queue.length;
    const highChurnCount = queue.filter((c) => c.churnLabel === 'Cao').length;
    const pctHighChurn = (highChurnCount / queue.length) * 100;
    const careCount = queue.filter((c) => !c.sellAllowed).length;

    const churnCounts = { Thấp: 0, 'Trung bình': 0, Cao: 0 } as Record<string, number>;
    queue.forEach((c) => { churnCounts[c.churnLabel] = (churnCounts[c.churnLabel] ?? 0) + 1; });
    const churnData = [
      { key: 'Thấp', name: t('churnLow'), value: churnCounts['Thấp'] ?? 0, color: CHURN_COLORS.good },
      { key: 'Trung bình', name: t('churnMedium'), value: churnCounts['Trung bình'] ?? 0, color: CHURN_COLORS.warn },
      { key: 'Cao', name: t('churnHigh'), value: churnCounts['Cao'] ?? 0, color: CHURN_COLORS.danger },
    ];

    const tierCounts: Record<string, number> = {};
    queue.forEach((c) => { tierCounts[c.tier] = (tierCounts[c.tier] ?? 0) + 1; });
    const tierData = ['Aff', 'MassAff', 'Mass'].filter((tier) => tierCounts[tier]).map((tier) => ({ name: tier, value: tierCounts[tier] }));

    const suggestionCounts: Record<string, number> = {};
    queue.forEach((c) => { suggestionCounts[c.suggestionCode] = (suggestionCounts[c.suggestionCode] ?? 0) + 1; });
    const suggestionData = Object.entries(suggestionCounts)
      .map(([code, value]) => ({ name: SUGGESTION_TEXT[code as SuggestionCode]?.[locale] ?? code, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { avgPriority, pctHighChurn, churnData, tierData, suggestionData, careCount, topSuggestion: suggestionData[0] };
  }, [queue, locale, t]);

  const barTooltip = <Tooltip cursor={{ fill: 'var(--navy-50)' }} formatter={(value: number) => [value, vi ? 'Khách hàng' : 'Customers']}/>;

  return <>
    <Hero
      eyebrow={vi ? 'Trợ lý phân tích khách hàng RB' : 'RB customer analytics assistant'}
      title={vi ? 'Thấu hiểu khách hàng —' : 'Understanding customers —'}
      accent={vi ? 'Trọn đời gắn kết' : 'a lifetime of loyalty'}
      description={vi
        ? 'Phân tích khách hàng 360°: chấm điểm ưu tiên theo khung MSB, nhận diện sớm rủi ro rời bỏ và đề xuất kịch bản tư vấn cá nhân hóa cho từng khách hàng.'
        : 'Customer 360 analytics: MSB-framework priority scoring, early churn-risk detection and a personalised consultation scenario per customer.'}
      actions={<Link href="/customers" className="button">{t('customers')} <ArrowRight size={16}/></Link>}
    />

    {query.isLoading ? <LoadingCards/> : query.isError ? <ErrorBox message={t('error')}/> : query.data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('totalCustomers')} value={query.data.portfolio.customerCount} icon={Users}/>
        <StatTile label={t('needAttention')} value={query.data.portfolio.needAttention} icon={AlertTriangle} tone="orange"/>
        <StatTile label={t('highPriority')} value={query.data.portfolio.highPriority} icon={Sparkles} tone="success"/>
        <StatTile label={t('customerCare')} value={query.data.portfolio.customerCare} icon={HeartHandshake} tone="danger"/>
      </div>

      {insight && <>
        <section className="card overflow-hidden">
          <SectionHead icon={Gauge} tone="orange" eyebrow={vi ? 'Đánh giá tổng quan danh mục' : 'Portfolio overview'}
            title={vi ? `RM ${rmName} đang quản lý ${queue.length} khách hàng` : `RM ${rmName} is managing ${queue.length} customers`}/>
          <div className="grid divide-y divide-navy-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className={`p-5 ${insight.pctHighChurn > 0 ? 'bg-red-50' : ''}`}>
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className={insight.pctHighChurn > 0 ? 'text-red-600' : 'text-navy-500'}/>
                <p className="label">{vi ? 'Rủi ro rời bỏ' : 'Churn risk'}</p>
              </div>
              <div className={`mt-2 text-4xl font-black leading-none ${insight.pctHighChurn > 0 ? 'text-red-600' : 'text-navy-900'}`}>{insight.pctHighChurn.toFixed(0)}%</div>
              <p className="mt-2 text-sm font-bold text-navy-800">{vi ? 'khách hàng rủi ro rời bỏ Cao' : 'customers at HIGH churn risk'}</p>
              <p className="mt-1 text-xs text-navy-500">
                {vi ? 'Ưu tiên liên hệ trước.' : 'Contact these first.'}
                {insight.careCount ? (vi ? ` ${insight.careCount} khách cần chăm sóc trước khi bán thêm sản phẩm.` : ` ${insight.careCount} need care before any further sales.`) : ''}
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2"><Target size={16} className="text-navy-500"/><p className="label">{t('priorityScore')}</p></div>
              <div className="mt-2 text-4xl font-black leading-none text-navy-900">{insight.avgPriority.toFixed(1)}</div>
              <p className="mt-2 text-sm font-bold text-navy-800">{vi ? 'điểm ưu tiên bình quân danh mục' : 'average portfolio priority score'}</p>
              <p className="mt-1 text-xs text-navy-500">{vi ? 'Thang 100 · càng cao càng nên liên hệ sớm.' : 'Out of 100 · higher means contact sooner.'}</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2"><Lightbulb size={16} className="text-orange-600"/><p className="label">{t('suggestion')}</p></div>
              {insight.topSuggestion ? <>
                <div className="mt-2 text-4xl font-black leading-none text-navy-900">{insight.topSuggestion.value}</div>
                <p className="mt-2 line-clamp-2 text-sm font-bold text-navy-800">{insight.topSuggestion.name}</p>
                <p className="mt-1 text-xs text-navy-500">{vi ? 'Kịch bản được gợi ý nhiều nhất trong danh mục' : 'Most common suggested scenario in the portfolio'}</p>
              </> : <p className="mt-2 text-sm text-navy-500">{t('empty')}</p>}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
        <section className="card flex flex-col">
          <SectionHead icon={Radar} tone="danger" eyebrow="M-Link Radar" title={vi ? 'Phân bổ rủi ro rời bỏ' : 'Churn risk'}/>
          <div className="h-[178px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insight.churnData} layout="vertical" margin={{ left: 4, right: 28 }}>
                <XAxis type="number" hide/>
                <YAxis type="category" dataKey="name" width={96} fontSize={11} tickLine={false} axisLine={false}/>
                {barTooltip}
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
                  {insight.churnData.map((row) => <Cell key={row.key} fill={row.color}/>)}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 800, fill: '#1f3357' }}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card flex flex-col">
          <SectionHead icon={Layers} tone="navy" eyebrow={vi ? 'Danh mục khách hàng' : 'Portfolio'} title={vi ? 'Phân khúc khách hàng' : 'Customer tiers'}/>
          <div className="h-[178px] p-4">
            {insight.tierData.length ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insight.tierData} layout="vertical" margin={{ left: 4, right: 28 }}>
                <XAxis type="number" hide/>
                <YAxis type="category" dataKey="name" width={96} fontSize={11} tickLine={false} axisLine={false}/>
                {barTooltip}
                <Bar dataKey="value" fill="#ea4e24" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 800, fill: '#1f3357' }}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer> : <Empty message={t('empty')}/>}
          </div>
        </section>

        <section className="card">
          <SectionHead icon={Lightbulb} tone="success" eyebrow={t('suggestion')} title={vi ? 'Kịch bản nhiều nhất' : 'Top scenarios'}/>
          <ol className="space-y-3 p-5">{insight.suggestionData.map((row) => <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="line-clamp-2 text-sm font-semibold text-navy-800" title={row.name}>{row.name}</span>
              <span className="shrink-0 text-sm font-black text-navy-900">{row.value}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-navy-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(row.value / insight.suggestionData[0].value) * 100}%` }}/></div>
          </li>)}</ol>
        </section>
        </div>
      </>}

      <section className="card overflow-hidden">
          <SectionHead icon={Sparkles} tone="orange" eyebrow="M-Link Radar" title={t('rbQueue')}
            actions={<div className="segmented" role="group" aria-label={t('rbQueue')}>{filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>}/>
          {!visible.length ? <div className="p-5"><Empty message={t('empty')}/></div> : <div className="table-wrap"><table className="data-table">
            <thead><tr><th className="w-12">#</th><th>{t('customers')}</th><th>{t('churnRisk')}</th><th>{t('recommendedAction')}</th><th>{t('priorityScore')}</th><th aria-label={t('viewCustomer')}/></tr></thead>
            <tbody>{visible.map((customer, index) => <tr key={customer.customerId} className="row-link" onClick={() => router.push(`/customers/${customer.customerId}`)}>
              <td className="font-black text-navy-500">{index + 1}</td>
              <td><div className="flex items-center gap-3"><Avatar name={customer.customerName} size={36}/><div><Link href={`/customers/${customer.customerId}`} className="font-extrabold hover:text-orange-600" onClick={(event) => event.stopPropagation()}>{customer.customerName}</Link><div className="text-xs text-navy-500">CIF {customer.customerId} · {customer.tier}</div></div></div></td>
              <td>{customer.sellAllowed ? <Badge tone={churnTone(customer.churnLabel)}>{churnText(customer.churnLabel, t)}</Badge> : <Badge tone="danger">{t('doNotSell')}</Badge>}</td>
              <td className="min-w-[16rem] max-w-md whitespace-normal"><div className="font-semibold">{customer.recommendedAction}</div>{customer.reason !== customer.recommendedAction && <div className="mt-0.5 text-xs text-navy-500">{customer.reason}</div>}</td>
              <td><div className="flex items-center gap-3"><span className="w-10 text-lg font-black text-orange-600">{customer.priorityScore.toFixed(1)}</span><div className="h-1.5 w-20 rounded-full bg-navy-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, customer.priorityScore))}%` }}/></div></div></td>
              <td className="text-right text-navy-500"><ChevronRight size={18} className="inline"/></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </>}
  </>;
}
