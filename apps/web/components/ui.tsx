import type { ReactNode } from 'react';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const tones = { neutral: 'bg-slate-100 text-slate-700', good: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-800', danger: 'bg-rose-100 text-rose-800' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function LoadingCards() {
  return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28" />)}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="card border-rose-200 bg-rose-50 p-5 text-rose-800">{message}</div>;
}

export function Empty({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{message}</div>;
}
