'use client';

import { CalendarRange } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { useApp } from '@/components/providers';
import { Badge } from './ui';   // relative on purpose: period.test.ts imports this file and vitest has no "@/" alias

type T = ReturnType<typeof useApp>['t'];
export type DataRange = { first: string; last: string };
export type Period = { from: string; to: string; days: number };

export const PRESET_DAYS = [7, 30, 90, 180, 365] as const;
const DEFAULT_DAYS = 90;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Same clamping rules as the API's resolveRange, so the UI never asks for an impossible range. */
export function resolvePeriod(dataRange: DataRange | undefined, from: string | null, to: string | null, defaultDays = DEFAULT_DAYS): Period | null {
  if (!dataRange) return null;
  let end = to && ISO.test(to) ? to : dataRange.last;
  if (end > dataRange.last) end = dataRange.last;
  if (end < dataRange.first) end = dataRange.first;
  let start = from && ISO.test(from) ? from : addDays(end, -(defaultDays - 1));
  if (start < dataRange.first) start = dataRange.first;
  if (start > end) start = end;
  return { from: start, to: end, days: daysBetween(start, end) + 1 };
}

/** Period state lives in the URL (`?from=&to=`) so a filtered view can be shared as a link. */
export function usePeriod(dataRange: DataRange | undefined) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const from = params.get('from');
  const to = params.get('to');
  const period = useMemo(() => resolvePeriod(dataRange, from, to), [dataRange, from, to]);
  const setPeriod = useCallback((next: { from: string; to: string }) => {
    const search = new URLSearchParams(params.toString());
    search.set('from', next.from);
    search.set('to', next.to);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  return { period, setPeriod, isDefault: !from && !to };
}

export function activePreset(period: Period, dataRange: DataRange): number | null {
  if (period.to !== dataRange.last) return null;
  return PRESET_DAYS.find((days) => period.days === Math.min(days, daysBetween(dataRange.first, dataRange.last) + 1)) ?? null;
}

export function formatDay(isoDate: string, locale: 'vi' | 'en') {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

export function PeriodFilter({ period, dataRange, onChange, t }: { period: Period; dataRange: DataRange; onChange: (next: { from: string; to: string }) => void; t: T }) {
  const preset = activePreset(period, dataRange);
  const pick = (days: number) => onChange({ from: addDays(dataRange.last, -(days - 1)) < dataRange.first ? dataRange.first : addDays(dataRange.last, -(days - 1)), to: dataRange.last });
  return <div className="card flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between">
    <div className="flex flex-wrap items-center gap-3">
      <span className="label flex items-center gap-1.5"><CalendarRange size={15}/>{t('period')}</span>
      <div className="segmented" role="group" aria-label={t('period')}>
        {PRESET_DAYS.map((days) => <button key={days} type="button" aria-pressed={preset === days} onClick={() => pick(days)}>{days} {t('daysUnit')}</button>)}
      </div>
      {preset === null && <Badge tone="warn">{t('customRange')}</Badge>}
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2"><span className="text-navy-500">{t('from')}</span><input type="date" className="field !w-auto !py-1.5" value={period.from} min={dataRange.first} max={period.to} onChange={(event) => event.target.value && onChange({ from: event.target.value, to: period.to })}/></label>
      <label className="flex items-center gap-2"><span className="text-navy-500">{t('to')}</span><input type="date" className="field !w-auto !py-1.5" value={period.to} min={period.from} max={dataRange.last} onChange={(event) => event.target.value && onChange({ from: period.from, to: event.target.value })}/></label>
    </div>
  </div>;
}
