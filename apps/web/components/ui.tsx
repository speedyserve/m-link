import type { ReactNode } from 'react';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const tones = { neutral: 'bg-navy-50 text-navy-500', good: 'bg-navy-100 text-navy-800', warn: 'bg-orange-50 text-orange-600', danger: 'bg-red-100 text-red-800' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function LoadingCards() {
  return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28" />)}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="card border-red-200 bg-red-50 p-5 text-red-800">{message}</div>;
}

export function Empty({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-navy-200 p-8 text-center text-navy-500">{message}</div>;
}
