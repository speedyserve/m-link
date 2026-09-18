import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

/** Values taken from MSB's own theme stylesheets; the design system must keep carrying them. */
const MSB_HEXES = ['#091e42', '#505f79', '#dee5ef', '#f4600c', '#e45f35', '#ff6a00', '#ffa95a', '#feefe7', '#f7f8f9'];
/** The previous green brand, and the stock chart colours it shipped with. */
const RETIRED = ['#087f5b', '#25a97b', '#056d4d', '#0b946b', 'rgba(8,127,91', 'rgba(8, 127, 91', '#f59e0b', '#6366f1'];
/** Palette families that must not reappear in markup once the brand scale exists. */
const RETIRED_CLASSES = ['emerald', 'indigo', 'slate-', 'amber-'];

function sourceFiles(...dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
    }
  };
  dirs.forEach((dir) => walk(join(root, dir)));
  return out;
}

describe('MSB design tokens', () => {
  const css = read('app/globals.css');
  const config = read('tailwind.config.ts');

  it.each(MSB_HEXES)('declares %s in globals.css', (hex) => {
    expect(css).toContain(hex);
  });

  it('mirrors the navy and orange anchors in the Tailwind scale', () => {
    for (const hex of ['#091e42', '#505f79', '#dee5ef', '#f4600c', '#e45f35', '#ff6a00', '#feefe7', '#f7f8f9']) {
      expect(config).toContain(hex);
    }
  });

  it.each(RETIRED)('no longer contains the retired value %s', (value) => {
    expect(css).not.toContain(value);
    expect(config).not.toContain(value);
  });

  it('keeps the primary button accessible: navy text on MSB orange', () => {
    expect(css).toMatch(/\.button\s*{[^}]*background:\s*var\(--orange-500\)[^}]*color:\s*var\(--navy-900\)/s);
  });

  it('loads Inter with the Vietnamese subset', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain("subsets: ['latin', 'vietnamese']");
    expect(layout).toContain("variable: '--font-inter'");
  });
});

describe('markup uses the brand scale only', () => {
  const files = sourceFiles('app', 'components');

  it('finds the pages and components to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(RETIRED_CLASSES)('uses no %s classes', (family) => {
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(family));
    expect(offenders.map((file) => file.replace(root, ''))).toEqual([]);
  });

  it('keeps the retired chart colours out of the charts', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const value of ['#087f5b', '#25a97b', '#f59e0b', '#6366f1']) expect(source).not.toContain(value);
    }
  });
});
