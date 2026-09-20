'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useApp } from '@/components/providers';
import { Avatar, Badge, Empty, ErrorBox, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

const formSchema = z.object({ search: z.string().max(100), tier: z.string() });
type FormValues = z.infer<typeof formSchema>;
type Customer = { id: string; customerCode: string; fullName: string; tier: string; branch: string | null; churnWarning: boolean; declaredBehaviour: string | null; declaredRiskAppetite: string | null; phone: string; email: string };
type Page = { items: Customer[]; page: number; limit: number; total: number; totalPages: number };

export default function CustomersPage() {
  const { rmId, t } = useApp();
  const router = useRouter();
  const [filters, setFilters] = useState<FormValues>({ search: '', tier: '' });
  const { register, handleSubmit, reset } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: filters });
  const params = new URLSearchParams({ limit: '50' });
  if (filters.search) params.set('search', filters.search);
  if (filters.tier) params.set('tier', filters.tier);
  const query = useQuery({ queryKey: ['customers', rmId, filters], queryFn: () => api<Page>(`/api/customers?${params}`, rmId) });
  const hasFilters = Boolean(filters.search || filters.tier);
  const clear = () => { reset({ search: '', tier: '' }); setFilters({ search: '', tier: '' }); };

  return <>
    <PageHeader eyebrow="CRM Workspace" title={t('customers')} description={query.data ? `${query.data.total} ${t('customers').toLowerCase()} · ${rmId}` : rmId}/>
    <form onSubmit={handleSubmit(setFilters)} className="card grid gap-3 p-4 md:grid-cols-[1fr_220px_auto_auto]">
      <div className="relative"><Search className="absolute left-3 top-[11px] text-navy-500" size={16}/><input {...register('search')} className="field !pl-9" placeholder={`${t('search')}...`} aria-label={t('search')}/></div>
      <select {...register('tier')} className="field" aria-label={t('tier')}><option value="">{t('all')} {t('tier').toLowerCase()}</option>{['Aff', 'MassAff', 'Mass'].map((item) => <option key={item}>{item}</option>)}</select>
      <button className="button" type="submit">{t('search')}</button>
      {hasFilters && <button className="button secondary" type="button" onClick={clear}>{t('clearFilters')}</button>}
    </form>
    {query.isError ? <ErrorBox message={t('error')}/> : <div className="card overflow-hidden">
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('customers')}</th><th>{t('tier')}</th><th>{t('behaviour')}</th><th>{t('churnRisk')}</th><th>{t('branch')}</th><th aria-label={t('viewCustomer')}/></tr></thead>
        <tbody>{query.data?.items.map((customer) => <tr key={customer.id} className="row-link" onClick={() => router.push(`/customers/${customer.id}`)}>
          <td><div className="flex items-center gap-3"><Avatar name={customer.fullName} size={36}/><div><Link href={`/customers/${customer.id}`} className="font-extrabold hover:text-orange-600" onClick={(event) => event.stopPropagation()}>{customer.fullName}</Link><div className="font-mono text-xs text-navy-500">{customer.customerCode}</div></div></div></td>
          <td><Badge tone="neutral">{customer.tier}</Badge></td>
          <td><div className="text-sm font-semibold">{customer.declaredBehaviour}</div><div className="text-xs text-navy-500">{customer.declaredRiskAppetite}</div></td>
          <td><Badge tone={customer.churnWarning ? 'danger' : 'good'}>{customer.churnWarning ? t('churnHigh') : t('churnLow')}</Badge></td>
          <td className="text-sm text-navy-500">{customer.branch}</td>
          <td className="text-right text-navy-500"><ChevronRight size={18} className="inline"/></td>
        </tr>)}</tbody>
      </table></div>
      {!query.isLoading && !query.data?.items.length && <div className="p-5"><Empty message={t('empty')}/></div>}
      <div className="border-t border-navy-100 px-5 py-3 text-sm text-navy-500">{query.data?.total ?? 0} {t('customers').toLowerCase()}</div>
    </div>}
  </>;
}
