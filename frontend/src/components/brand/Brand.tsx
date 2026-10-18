import { cn } from '@/lib/utils';

// A flood-gauge staff: graduated marks with the water line across them.
export function Mark({ size = 32, className, inverted = false }: { size?: number; className?: string; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill={inverted ? '#FFFFFF' : '#10262C'} />
      <path d="M0 21 Q8 18.5 16 21 T32 21 V24 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8 Z" fill="#1C9AA6" />
      <g fill={inverted ? '#10262C' : '#FFFFFF'}>
        <rect x="14.5" y="5" width="3" height="22" rx="1" />
        <rect x="17.5" y="7" width="5" height="2" rx="1" />
        <rect x="17.5" y="11.5" width="3" height="2" rx="1" />
        <rect x="17.5" y="16" width="5" height="2" rx="1" />
      </g>
    </svg>
  );
}

export function Wordmark({ sub, inverted = false }: { sub?: string; inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark inverted={inverted} />
      <span className="leading-tight">
        <span className={cn('block font-display text-[19px] font-bold', inverted ? 'text-white' : 'text-ink')}>ResQNet</span>
        {sub && <span className={cn('block text-[13px]', inverted ? 'text-[#B7C8C6]' : 'text-neutral-500')}>{sub}</span>}
      </span>
    </span>
  );
}
