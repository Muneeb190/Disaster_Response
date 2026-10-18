import { cn } from '@/lib/utils';

// A beacon: a point with signal arcs — someone sending, someone listening.
export function Mark({ size = 34, className }: { size?: number; className?: string; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="34" height="34" rx="10" className="fill-primary-600" />
      <g fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-on-primary">
        <path d="M11.5 15.5a7.8 7.8 0 0 1 11 0" />
        <path d="M7.6 11.6a13.3 13.3 0 0 1 18.8 0" opacity="0.6" />
      </g>
      <circle cx="17" cy="21" r="3.4" className="fill-on-primary" />
    </svg>
  );
}

export function Wordmark({ sub, inverted = false }: { sub?: string; inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="leading-tight">
        <span className={cn('block font-display text-[18px] font-extrabold tracking-tight', inverted ? 'text-white' : 'text-ink')}>ResQNet</span>
        {sub && <span className={cn('block text-[13px] font-medium', inverted ? 'text-white/70' : 'text-neutral-500')}>{sub}</span>}
      </span>
    </span>
  );
}
