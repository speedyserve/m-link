import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const tones = { neutral: 'bg-navy-50 text-navy-500', good: 'bg-navy-100 text-navy-800', warn: 'bg-orange-50 text-orange-600', danger: 'bg-red-100 text-red-800' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function LoadingCards() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28" />)}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="card border-red-200 bg-red-50 p-5 text-red-800">{message}</div>;
}

export function Empty({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-navy-200 bg-white p-8 text-center text-sm text-navy-500">{message}</div>;
}

/** Title block shared by every page: small eyebrow, title, optional description and actions. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile: icon chip, value and label. */
export function StatTile({ label, value, icon: Icon, tone = 'navy' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'navy' | 'orange' | 'danger' }) {
  const chip = { navy: 'bg-navy-50 text-navy-800', orange: 'bg-orange-50 text-orange-600', danger: 'bg-red-50 text-red-700' }[tone];
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${chip}`}><Icon size={22} /></div>
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none">{value}</div>
        <div className="mt-1.5 truncate text-sm text-navy-500">{label}</div>
      </div>
    </div>
  );
}

/** Underlined tab bar (the selected tab carries the orange indicator). */
export function Tabs<T extends string>({ items, value, onChange }: { items: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={value === item.id} className="tab" onClick={() => onChange(item.id)}>{item.label}</button>
      ))}
    </div>
  );
}

/** Round initials badge used where the bank would show a customer or RM photo. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('');
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-navy-800 font-black text-white" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials}
    </span>
  );
}
