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

export function Hero({ eyebrow, title, accent, description, actions }: { eyebrow: string; title: string; accent?: string; description?: string; actions?: ReactNode }) {
  return (
    <section className="workspace-hero">
      <div className="workspace-hero-content flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="workspace-hero-eyebrow">{eyebrow}</p>
          <h1 className="workspace-hero-title">
            {title}{accent && <> <span className="workspace-hero-accent">{accent}</span></>}
          </h1>
          {description && <p className="workspace-hero-description">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </section>
  );
}

/** KPI tile: soft tinted surface with a light icon chip — brighter than a solid dark chip. */
export function StatTile({ label, value, icon: Icon, tone = 'navy' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'navy' | 'orange' | 'danger' | 'success' }) {
  return (
    <div className={`metric-tile metric-tile--${tone}`}>
      <div className="metric-tile__icon"><Icon size={21} /></div>
      <div className="min-w-0">
        <div className="metric-tile__value">{value}</div>
        <div className="metric-tile__label">{label}</div>
      </div>
    </div>
  );
}

/** Card header with a tinted icon chip, small eyebrow label and title. */
export function SectionHead({ icon: Icon, eyebrow, title, tone = 'navy', actions }: { icon: LucideIcon; eyebrow: string; title: string; tone?: 'navy' | 'orange' | 'danger' | 'success'; actions?: ReactNode }) {
  const chip = {
    navy: 'bg-navy-50 text-navy-800', orange: 'bg-orange-50 text-orange-600',
    danger: 'bg-red-50 text-red-600', success: 'bg-emerald-50 text-success',
  }[tone];
  return (
    <div className="card-head">
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${chip}`}><Icon size={18} /></div>
        <div><p className="label">{eyebrow}</p><h2 className="mt-0.5 text-base font-extrabold">{title}</h2></div>
      </div>
      {actions}
    </div>
  );
}

/** Underlined tab bar (the selected tab carries the orange indicator). */
export function Tabs<T extends string>({ items, value, onChange }: { items: ReadonlyArray<{ id: T; label: string; icon?: LucideIcon }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => {
        const Icon = item.icon;
        return <button key={item.id} type="button" role="tab" aria-selected={value === item.id} className="tab" onClick={() => onChange(item.id)}>
          {Icon && <span className="tab-icon"><Icon size={15}/></span>}
          {item.label}
        </button>;
      })}
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
