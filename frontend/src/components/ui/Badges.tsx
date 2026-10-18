import { cn } from '@/lib/utils';
import { TEAM_STATUS_LABELS, type PriorityLevel, type IncidentStatus, type VerificationStatus, type TeamStatus, type AssignmentStatus } from '@/types';

export function PriorityBadge({ level, className }: { level: PriorityLevel; className?: string }) {
  const map: Record<PriorityLevel, string> = {
    critical: 'badge-critical',
    high: 'badge-high',
    moderate: 'badge-moderate',
    low: 'badge-low',
  };
  const labels: Record<PriorityLevel, string> = {
    critical: 'Critical',
    high: 'High',
    moderate: 'Moderate',
    low: 'Low',
  };
  return <span className={cn(map[level], className)}>{labels[level]}</span>;
}

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  const map: Record<IncidentStatus, string> = {
    reported: 'badge-info',
    verified: 'badge-info',
    assigned: 'badge-warning',
    dispatched: 'badge-warning',
    resolved: 'badge-success',
    cancelled: 'badge-neutral',
  };
  const labels: Record<IncidentStatus, string> = {
    reported: 'Reported',
    verified: 'Verified',
    assigned: 'Assigned',
    dispatched: 'Dispatched',
    resolved: 'Resolved',
    cancelled: 'Cancelled',
  };
  return <span className={cn(map[status], className)}>{labels[status]}</span>;
}

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const map: Record<VerificationStatus, string> = {
    pending: 'badge-neutral',
    verified: 'badge-success',
    disputed: 'badge-error',
    flagged: 'badge-warning',
  };
  const labels: Record<VerificationStatus, string> = {
    pending: 'Pending',
    verified: 'Verified',
    disputed: 'Disputed',
    flagged: 'Flagged',
  };
  return <span className={cn(map[status], className)}>{labels[status]}</span>;
}

export function TeamStatusBadge({ status, className }: { status: TeamStatus; className?: string }) {
  const map: Record<TeamStatus, string> = {
    available: 'badge-success',
    assigned: 'badge-warning',
    en_route: 'badge-info',
    unavailable: 'badge-error',
    offline: 'badge-neutral',
  };
  return <span className={cn(map[status], className)}>{TEAM_STATUS_LABELS[status]}</span>;
}

// Shown on any seeded/simulated record so demo data is never mistaken for live data.
export function DemoBadge({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-neutral-400 px-2.5 py-0.5 text-[13px] font-semibold text-neutral-600', className)} title="Seeded or simulated data, not a live record">Demo data</span>;
}

export function AssignmentStatusBadge({ status, className }: { status: AssignmentStatus; className?: string }) {
  const map: Record<AssignmentStatus, string> = {
    assigned: 'badge-warning',
    dispatched: 'badge-info',
    completed: 'badge-success',
    cancelled: 'badge-neutral',
  };
  const labels: Record<AssignmentStatus, string> = {
    assigned: 'Assigned',
    dispatched: 'Dispatched',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return <span className={cn(map[status], className)}>{labels[status]}</span>;
}

export function TriStateBadge({ value, label, className }: { value: 'yes' | 'no' | 'unknown'; label: string; className?: string }) {
  const map = {
    yes: 'badge-error',
    no: 'badge-success',
    unknown: 'badge-neutral',
  };
    return (
    <span className={cn(map[value], className)}>
      {label}: {value === 'unknown' ? 'not sure' : value}
    </span>
  );
}
