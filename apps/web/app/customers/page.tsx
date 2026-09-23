'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Layers, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { CustomerMetrics } from '@mlink/contracts';
import { useApp } from '@/components/providers';
import { churnText, churnTone } from '@/components/metrics-panel';
import { Avatar, Badge, Empty, ErrorBox, Hero, SectionHead, StatTile } from '@/components/ui';
import { api, money } from '@/lib/api';

const formSchema = z.object({ search: z.string().max(100), tier: z.string(), churnRisk: z.string(), sort: z.string() });
type FormValues = z.infer<typeof formSchema>;
type Customer = { id: string; customerCode: string; fullName: string; tier: string; branch: string | null; churnWarning: boolean; declaredBehaviour: string | null; declaredRiskAppetite: string | null; phone: string; email: string; metrics: CustomerMetrics | null };
type Page = { items: Customer[]; page: number; limit: number; total: number; totalPages: number };

export default function CustomersPage() {
  const { rmId, rmName, locale, t } = useApp();
  const vi = locale === 'vi';
  const router = useRouter();
  const DEFAULT_FILTERS: FormValues = { search: '', tier: '', churnRisk: '', sort: '' };
  const [filters, setFilters] = useState<FormValues>(DEFAULT_FILTERS);
  const { register, handleSubmit, reset } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: filters });
  const params = new URLSearchParams({ limit: '50' });
  if (filters.search) params.set('search', filters.search);
  if (filters.tier) params.set('tier', filters.tier);
  const query = useQuery({ queryKey: ['customers', rmId, filters.search, filters.tier], queryFn: () => api<Page>(`/api/customers?${params}`, rmId) });
  const hasFilters = Boolean(filters.search || filters.tier || filters.churnRisk || filters.sort);
  const clear = () => { reset(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); };

  const allItems = useMemo(() => query.data?.items ?? [], [query.data]);
  // Churn risk (2-tier, see churnTone/churnText) and sorting apply client-side over the
  // already-loaded page — the RM's customer count (≤50, the page limit) fits in one page.
  const items = useMemo(() => {
    let rows = allItems;
    if (filters.churnRisk) rows = rows.filter((c) => (filters.churnRisk === 'high' ? c.metrics?.churnLabel !== 'Thấp' : c.metrics?.churnLabel === 'Thấp'));
    if (filters.sort === 'assets') rows = [...rows].sort((a, b) => Number(b.metrics?.tav ?? 0) - Number(a.metrics?.tav ?? 0));
    else if (filters.sort === 'priority') rows = [...rows].sort((a, b) => (b.metrics?.priorityScore ?? 0) - (a.metrics?.priorityScore ?? 0));
    return rows;
  }, [allItems, filters.churnRisk, filters.sort]);
  const tierCount = (tier: string) => allItems.filter((c) => c.tier === tier).length;

  return <>
    <Hero
      eyebrow={vi ? 'Danh mục khách hàng RB' : 'RB customer portfolio'}
      title={t('navCustomers')}
      description={vi
        ? `Toàn bộ khách hàng do RM ${rmName} phụ trách, kèm phân hạng và cảnh báo rủi ro rời bỏ.`
        : `Every customer managed by RM ${rmName}, with tier and churn-risk flags.`}
    />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label={hasFilters ? (vi ? 'Kết quả lọc' : 'Filtered results') : t('totalCustomers')} value={items.length} icon={Users}/>
      <StatTile label="Aff" value={tierCount('Aff')} icon={Layers} tone="success"/>
      <StatTile label="MassAff" value={tierCount('MassAff')} icon={Layers} tone="orange"/>
      <StatTile label="Mass" value={tierCount('Mass')} icon={Layers}/>
    </div>

    <form onSubmit={handleSubmit(setFilters)} className="card grid gap-3 p-4 md:grid-cols-[1fr_160px_180px_200px_auto_auto]">
      <div className="relative"><Search className="absolute left-3 top-[11px] text-navy-500" size={16}/><input {...register('search')} className="field !pl-9" placeholder={vi ? 'Tìm kiếm khách hàng theo CIF, SĐT, tên...' : 'Search customers by CIF, phone, name...'} aria-label={t('search')}/></div>
      <select {...register('tier')} className="field" aria-label={t('tier')}><option value="">{t('all')} {t('tier').toLowerCase()}</option>{['Aff', 'MassAff', 'Mass'].map((item) => <option key={item}>{item}</option>)}</select>
      <select {...register('churnRisk')} className="field" aria-label={t('churnRisk')}>
        <option value="">{t('all')} {t('churnRisk').toLowerCase()}</option>
        <option value="low">{t('churnLow')}</option>
        <option value="high">{t('churnHigh')}</option>
      </select>
      <select {...register('sort')} className="field" aria-label={vi ? 'Sắp xếp theo' : 'Sort by'}>
        <option value="">{vi ? 'Sắp xếp: Tên A-Z' : 'Sort: Name A-Z'}</option>
        <option value="assets">{vi ? 'Tổng tài sản cao nhất' : 'Highest total assets'}</option>
        <option value="priority">{vi ? 'Ưu tiên liên hệ cao nhất' : 'Highest contact priority'}</option>
      </select>
      <button className="button" type="submit">{t('search')}</button>
      {hasFilters && <button className="button secondary" type="button" onClick={clear}>{t('clearFilters')}</button>}
    </form>

    {query.isError ? <ErrorBox message={t('error')}/> : <section className="card overflow-hidden">
      <SectionHead icon={Users} tone="orange" eyebrow={vi ? 'Phân tích 360 độ KH' : 'Customer 360 analytics'} title={t('customers')}
        actions={<span className="text-sm font-bold text-navy-500">{items.length} {t('customers').toLowerCase()}</span>}/>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('customers')}</th><th>{t('tier')}</th><th>{t('totalAssets')}</th><th>{t('churnRisk')}</th><th>{t('priorityScore')}</th><th>{t('branch')}</th><th aria-label={t('viewCustomer')}/></tr></thead>
        <tbody>{items.map((customer) => <tr key={customer.id} className="row-link" onClick={() => router.push(`/customers/${customer.id}`)}>
          <td><div className="flex items-center gap-3"><Avatar name={customer.fullName} size={36}/><div><Link href={`/customers/${customer.id}`} className="font-extrabold hover:text-orange-600" onClick={(event) => event.stopPropagation()}>{customer.fullName}</Link><div className="font-mono text-xs text-navy-500">{customer.customerCode}</div></div></div></td>
          <td><Badge tone="neutral">{customer.tier}</Badge></td>
          <td className="text-sm font-bold text-navy-900">{customer.metrics ? money(customer.metrics.tav, locale) : '—'}</td>
          <td>{customer.metrics
            ? <Badge tone={churnTone(customer.metrics.churnLabel)}>{churnText(customer.metrics.churnLabel, t)}</Badge>
            : <Badge tone={customer.churnWarning ? 'danger' : 'good'}>{customer.churnWarning ? t('churnHigh') : t('churnLow')}</Badge>}</td>
          <td>{customer.metrics ? <div className="flex items-center gap-3"><span className="w-10 text-base font-black text-orange-600">{customer.metrics.priorityScore.toFixed(1)}</span><div className="h-1.5 w-16 rounded-full bg-navy-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, customer.metrics.priorityScore))}%` }}/></div></div> : '—'}</td>
          <td className="text-sm text-navy-500">{customer.branch}</td>
          <td className="text-right text-navy-500"><ChevronRight size={18} className="inline"/></td>
        </tr>)}</tbody>
      </table></div>
      {!query.isLoading && !items.length && <div className="p-5"><Empty message={t('empty')}/></div>}
    </section>}
  </>;
}
