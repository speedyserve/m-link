'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Languages, LayoutDashboard, Menu, Users, X } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { Avatar } from '@/components/ui';
import { api } from '@/lib/api';
import { messages, type Locale, type MessageKey } from '@/lib/i18n';

type RM = { id: string; name: string; branch: string };
type DashboardSummary = { portfolio: { needAttention: number } };
type AppContextValue = { rmId: string; rmName: string; setRmId: (value: string) => void; locale: Locale; setLocale: (value: Locale) => void; t: (key: MessageKey) => string };
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    updateRmId(localStorage.getItem('mlink-rm') ?? 'RM001');
    updateLocale((localStorage.getItem('mlink-locale') as Locale) ?? 'vi');
  }, []);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const setRmId = (value: string) => { localStorage.setItem('mlink-rm', value); updateRmId(value); };
  const setLocale = (value: Locale) => { localStorage.setItem('mlink-locale', value); document.cookie = `mlink-locale=${value};path=/;max-age=31536000`; updateLocale(value); };
  const t = (key: MessageKey) => messages[locale][key];
  const rms = useQuery({ queryKey: ['rms'], queryFn: () => api<RM[]>('/api/rms', rmId) });
  const currentRm = rms.data?.find((rm) => rm.id === rmId);
  // Same query key as the dashboard page, so the bell reuses that cache instead of refetching.
  const dashboard = useQuery({ queryKey: ['dashboard', rmId], queryFn: () => api<DashboardSummary>('/api/dashboard', rmId) });
  const alerts = dashboard.data?.portfolio.needAttention ?? 0;
  const value = { rmId, rmName: currentRm?.name ?? rmId, setRmId, locale, setLocale, t };

  // The sidebar keeps short labels; the top bar shows the fuller page title.
  const nav = [
    { href: '/dashboard', label: t('dashboard'), pageTitle: t('navDashboard'), icon: LayoutDashboard },
    { href: '/customers', label: t('customers'), pageTitle: t('navCustomers'), icon: Users },
  ];
  const pageTitle = pathname.startsWith('/customers/') ? t('customer360') : nav.find((item) => pathname.startsWith(item.href))?.pageTitle ?? '';

  return <AppContext.Provider value={value}>
    <div className="min-h-screen lg:pl-64">
      <aside className="sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col" data-open={menuOpen}>
        <div className="flex h-20 shrink-0 items-center justify-between px-5">
          <Link href="/dashboard" aria-label="M-Link"><Wordmark/></Link>
          <button type="button" className="text-navy-500 hover:text-navy-900 lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={20}/></button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="nav-link" aria-current={pathname.startsWith(href) ? 'page' : undefined}><Icon size={18}/>{label}</Link>)}
        </nav>
        <div className="flex items-center gap-3 border-t border-navy-100 p-4">
          <Avatar name={currentRm?.name ?? rmId} size={36}/>
          <div className="min-w-0"><div className="truncate text-sm font-bold text-navy-900">{currentRm?.name ?? rmId}</div><div className="truncate text-xs text-navy-500">{currentRm ? `${rmId} · ${currentRm.branch}` : rmId}</div></div>
        </div>
      </aside>
      {menuOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-navy-900/50 lg:hidden" onClick={() => setMenuOpen(false)}/>}
      <header className="topbar sticky top-0 z-20 flex h-20 items-center gap-3 px-4 lg:px-8">
        <button type="button" className="button secondary !px-2.5 lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={18}/></button>
        <div className="min-w-0 truncate text-xl font-black uppercase tracking-tight text-orange-600 md:text-2xl">{pageTitle}</div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/dashboard" aria-label={`${t('needAttention')}: ${alerts}`}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-navy-200 bg-white text-navy-800 transition hover:bg-navy-50">
            <Bell size={18}/>
            {alerts > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger px-1 text-[11px] font-black text-white">{alerts > 99 ? '99+' : alerts}</span>}
          </Link>
          <select aria-label="Relationship manager" className="field !w-auto min-w-0 max-w-[15rem] sm:max-w-[19rem]" value={rmId} onChange={(event) => setRmId(event.target.value)}>{rms.data?.map((rm) => <option key={rm.id} value={rm.id}>{rm.name} · {rm.branch}</option>) ?? <option value="RM001">RM001</option>}</select>
          <button type="button" aria-label="Change language" className="button secondary !px-3" onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}><Languages size={16}/>{locale.toUpperCase()}</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] space-y-5 px-4 py-6 lg:px-8">{children}</main>
    </div>
  </AppContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}><Shell>{children}</Shell></QueryClientProvider>;
}
