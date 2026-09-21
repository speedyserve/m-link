import { describe, expect, it } from 'vitest';
import { activePreset, resolvePeriod } from '../components/period-filter';

const dataRange = { first: '2025-09-19', last: '2026-09-18' };

describe('resolvePeriod', () => {
  it('defaults to the last 90 days when the URL has no range', () => {
    expect(resolvePeriod(dataRange, null, null)).toEqual({ from: '2026-06-21', to: '2026-09-18', days: 90 });
  });
  it('clamps into the data range and ignores malformed values', () => {
    expect(resolvePeriod(dataRange, '2020-01-01', 'garbage')).toEqual({ from: '2025-09-19', to: '2026-09-18', days: 365 });
  });
  it('returns null without a data range', () => {
    expect(resolvePeriod(undefined, '2026-01-01', '2026-01-31')).toBeNull();
  });
});

describe('activePreset', () => {
  it('recognises presets anchored on the last day', () => {
    expect(activePreset({ from: '2026-08-20', to: '2026-09-18', days: 30 }, dataRange)).toBe(30);
    expect(activePreset({ from: '2026-01-01', to: '2026-01-31', days: 31 }, dataRange)).toBeNull();
  });
});
