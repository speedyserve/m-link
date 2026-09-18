'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useApp } from '@/components/providers';
import { Badge, Empty, ErrorBox } from '@/components/ui';
import { api } from '@/lib/api';

const formSchema = z.object({ search: z.string().max(100), tier: z.string() });
type FormValues = z.infer<typeof formSchema>;
type Customer = { id: string; customerCode: string; fullName: string; tier: string; branch: string | null; churnWarning: boolean; declaredBehaviour: string | null; declaredRiskAppetite: string | null; phone: string; email: string };
type Page = { items: Customer[]; page: number; limit: number; total: number; totalPages: number };

export default function CustomersPage() {
  const { rmId, t } = useApp();
  const [filters, setFilters] = useState<FormValues>({ search: '', tier: '' });
  const { register, handleSubmit } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: filters });
  const params = new URLSearchParams({ limit: '50' });
  if (filters.search) params.set('search', filters.search);
  if (filters.tier) params.set('tier', filters.tier);
  const query = useQuery({ queryKey: ['customers', rmId, filters], queryFn: () => api<Page>(`/api/customers?${params}`, rmId) });
  return <div className="space-y-6">
    <div><p className="label">CRM Workspace</p><h1 className="mt-2 text-3xl font-black">{t('customers')}</h1></div>
    <form onSubmit={handleSubmit(setFilters)} className="card grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]">
      <div className="relative"><Search className="absolute left-3 top-3 text-navy-500" size={18}/><input {...register('search')} className="field !pl-10" placeholder={`${t('search')}...`}/></div>
      <select {...register('tier')} className="field"><option value="">{t('all')} {t('tier').toLowerCase()}</option>{['Aff', 'MassAff', 'Mass'].map((item) => <option key={item}>{item}</option>)}</select>
      <button className="button" type="submit">{t('search')}</button>
    </form>
    {query.isError ? <ErrorBox message={t('error')}/> : <div className="card overflow-hidden"><div className="table-wrap"><table><thead><tr><th>CIF</th><th>{t('customers')}</th><th>{t('tier')}</th><th>{t('behaviour')}</th><th>{t('churnRisk')}</th><th>{t('branch')}</th><th/></tr></thead><tbody>{query.data?.items.map((customer) => <tr key={customer.id}><td className="font-mono text-xs">{customer.customerCode}</td><td className="font-bold">{customer.fullName}</td><td><Badge tone="neutral">{customer.tier}</Badge></td><td><div className="text-sm">{customer.declaredBehaviour}</div><div className="text-xs text-navy-500">{customer.declaredRiskAppetite}</div></td><td><Badge tone={customer.churnWarning ? 'danger' : 'good'}>{customer.churnWarning ? t('churnHigh') : t('churnLow')}</Badge></td><td className="text-sm text-navy-500">{customer.branch}</td><td><Link className="flex items-center gap-2 font-bold text-navy-800" href={`/customers/${customer.id}`}>{t('viewCustomer')} <ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <div className="p-5"><Empty message={t('empty')}/></div>}<div className="border-t border-navy-100 p-4 text-sm text-navy-500">{query.data?.total ?? 0} {t('customers').toLowerCase()}</div></div>}
  </div>;
}
