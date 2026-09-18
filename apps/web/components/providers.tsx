'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { Languages } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { api } from '@/lib/api';
import { messages, type Locale, type MessageKey } from '@/lib/i18n';

type RM = { id: string; name: string; branch: string };
type AppContextValue = { rmId: string; setRmId: (value: string) => void; locale: Locale; setLocale: (value: Locale) => void; t: (key: MessageKey) => string };
const AppContext = createContext<AppContextValue | null>(null);
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider is missing');
  return value;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [rmId, updateRmId] = useState('RM001');
  const [locale, updateLocale] = useState<Locale>('vi');
  useEffect(() => {
    updateRmId(localStorage.getItem('mlink-rm') ?? 'RM001');
    updateLocale((localStorage.getItem('mlink-locale') as Locale) ?? 'vi');
  }, []);
  const setRmId = (value: string) => { localStorage.setItem('mlink-rm', value); updateRmId(value); };
  const setLocale = (value: Locale) => { localStorage.setItem('mlink-locale', value); document.cookie = `mlink-locale=${value};path=/;max-age=31536000`; updateLocale(value); };
  const t = (key: MessageKey) => messages[locale][key];
  const value = { rmId, setRmId, locale, setLocale, t };
  const rms = useQuery({ queryKey: ['rms'], queryFn: () => api<RM[]>('/api/rms', rmId) });
  return <AppContext.Provider value={value}>
    <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3">
        <Link href="/dashboard" aria-label="M-Link"><Wordmark/></Link>
        <nav className="hidden gap-1 md:flex"><Link className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-orange-50" href="/dashboard">{t('dashboard')}</Link><Link className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-orange-50" href="/customers">{t('customers')}</Link></nav>
        <div className="ml-auto flex items-center gap-2">
          <select aria-label="Relationship manager" className="field max-w-52 text-sm" value={rmId} onChange={(event) => setRmId(event.target.value)}>{rms.data?.map((rm) => <option key={rm.id} value={rm.id}>{rm.name} · {rm.branch}</option>) ?? <option value="RM001">RM001</option>}</select>
          <button aria-label="Change language" className="button secondary !px-3" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}><Languages size={17}/>{locale.toUpperCase()}</button>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
  </AppContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}><Shell>{children}</Shell></QueryClientProvider>;
}
