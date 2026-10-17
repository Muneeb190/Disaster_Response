import type { RiskFactor } from '@/types';

// Top reasons as a short line for lists (feature 13).
export function topReasons(factors: RiskFactor[] | null | undefined, max = 2) {
  return (factors ?? [])
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, max)
    .map((f) => f.label);
}
