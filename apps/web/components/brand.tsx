import Image from 'next/image';

/**
 * MSB's real icon mark (public/brand/msb-icon.svg, from the bank's own brand assets) paired with
 * the "M-Link" wordmark for this internal tool.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  return <Image src="/brand/msb-icon.svg" alt="MSB" width={size} height={Math.round((size * 31) / 52)} className="shrink-0" priority/>;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <BrandMark size={52}/>
      <span className="leading-tight">
        <span className="block text-2xl font-black tracking-tight text-navy-900">MSB</span>
        <span className="block text-sm font-bold uppercase tracking-[.14em] text-orange-600">M-Link</span>
      </span>
    </span>
  );
}
