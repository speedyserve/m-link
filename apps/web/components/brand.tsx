/**
 * M-Link wordmark drawn in code with the MSB palette. The bank's own logo files are deliberately
 * not bundled: this is a product mark for an internal tool, not a reproduction of MSB's logo.
 */
export function BrandMark({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" role="img" aria-label="M-Link" className="shrink-0">
      <rect width="36" height="36" rx="12" fill={onDark ? '#ffffff' : '#091e42'} />
      <path d="M9 25V11.5l5.6 7.2 5.6-7.2V25" fill="none" stroke="#f4600c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26.5" cy="13" r="2.2" fill="#ff6a00" />
    </svg>
  );
}

/** `onDark` renders the light variant used on the navy sidebar. */
export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark onDark={onDark} />
      <span className="leading-tight">
        <span className={`block text-xl font-black tracking-tight ${onDark ? 'text-white' : 'text-navy-900'}`}>M-Link</span>
        <span className={`block text-[10px] font-bold uppercase tracking-[.14em] ${onDark ? 'text-white/60' : 'text-navy-500'}`}>MSB Retail Banking</span>
      </span>
    </span>
  );
}
