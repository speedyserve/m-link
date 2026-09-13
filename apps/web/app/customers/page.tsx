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

const formSchema = z.object({ search: z.string().max(100), segment: z.string() });
type FormValues = z.infer<typeof formSchema>;
type Customer = { id: string; customerCode: string; fullName: string; segment: string; relationshipStatus: string; phone: string; email: string };
type Page = { items: Customer[]; page: number; limit: number; total: number; totalPages: number };

export default function CustomersPage() {
  const { rmId, t } = useApp();
  const [filters, setFilters] = useState<FormValues>({ search: '', segment: '' });
  const { register, handleSubmit } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: filters });
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.segment) params.set('segment', filters.segment);
  const query = useQuery({ queryKey: ['customers', rmId, filters], queryFn: () => api<Page>(`/api/customers?${params}`, rmId) });
  return <div className="space-y-6">
    <div><p className="label">CRM Workspace</p><h1 className="mt-2 text-3xl font-black">{t('customers')}</h1></div>
    <form onSubmit={handleSubmit(setFilters)} className="card grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]">
      <div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input {...register('search')} className="field !pl-10" placeholder={`${t('search')}...`}/></div>
      <select {...register('segment')} className="field"><option value="">{t('all')} {t('segment').toLowerCase()}</option>{['MASS','MASS_AFFLUENT','PRIORITY','PRIVATE'].map((item) => <option key={item}>{item}</option>)}</select>
      <button className="button" type="submit">{t('search')}</button>
    </form>
    {query.isError ? <ErrorBox message={t('error')}/> : <div className="card overflow-hidden"><div className="table-wrap"><table><thead><tr><th>ID</th><th>{t('customers')}</th><th>{t('segment')}</th><th>Status</th><th>Contact</th><th/></tr></thead><tbody>{query.data?.items.map((customer) => <tr key={customer.id}><td className="font-mono text-xs">{customer.customerCode}</td><td className="font-bold">{customer.fullName}</td><td><Badge tone="neutral">{customer.segment}</Badge></td><td><Badge tone={customer.relationshipStatus === 'HEALTHY' ? 'good' : 'warn'}>{customer.relationshipStatus}</Badge></td><td><div className="text-sm">{customer.phone}</div><div className="text-xs text-slate-500">{customer.email}</div></td><td><Link className="flex items-center gap-2 font-bold text-emerald-700" href={`/customers/${customer.id}`}>{t('viewCustomer')} <ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <div className="p-5"><Empty message={t('empty')}/></div>}<div className="border-t border-slate-100 p-4 text-sm text-slate-500">{query.data?.total ?? 0} {t('customers').toLowerCase()}</div></div>}
  </div>;
}
