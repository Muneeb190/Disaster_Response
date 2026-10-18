import { cn } from '@/lib/utils';
import type { PriorityLevel } from '@/types';

const FILL: Record<PriorityLevel, string> = { critical: '#C8261B', high: '#C2510C', moderate: '#B98410', low: '#5F8C79' };
const LABEL: Record<PriorityLevel, string> = { critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low' };

// A gauge staff: the score fills it like a water level. Marks at the 25/50/75 level boundaries.
export function PriorityGauge({ score, level, size = 'md', showLabel = true, className }: { score: number; level: PriorityLevel; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const dims = { sm: 'h-9 w-2.5', md: 'h-14 w-3', lg: 'h-28 w-5' }[size];
  return (
    <div className={cn('flex items-end gap-2', className)} role="img" aria-label={`Priority ${LABEL[level]}, score ${pct} of 100`}>
      <div className={cn('relative overflow-hidden rounded-[3px] bg-neutral-200', dims)}>
        <div className="absolute inset-x-0 bottom-0 transition-[height] duration-500" style={{ height: `${pct}%`, background: FILL[level] }} />
        {[25, 50, 75].map((mark) => <span key={mark} className="absolute inset-x-0 h-px bg-white/80" style={{ bottom: `${mark}%` }} />)}
      </div>
      {showLabel && (
        <div className="leading-none">
          <span className={cn('block font-display font-bold text-ink', size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-lg')}>{pct}</span>
          <span className="mt-1 block text-[13px] font-semibold" style={{ color: level === 'moderate' ? '#946000' : level === 'low' ? '#3D6B5A' : FILL[level] }}>{LABEL[level]}</span>
        </div>
      )}
    </div>
  );
}
