import { cn } from '@/lib/utils';
import type { PriorityLevel, IncidentStatus, VerificationStatus, TeamStatus, AssignmentStatus } from '@/types';

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
    offline: 'badge-neutral',
  };
  const labels: Record<TeamStatus, string> = {
    available: 'Available',
    assigned: 'Assigned',
    offline: 'Offline',
  };
  return <span className={cn(map[status], className)}>{labels[status]}</span>;
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
  const icons = { yes: '⚠', no: '✓', unknown: '?' };
  return (
    <span className={cn(map[value], className)}>
      {icons[value]} {label}: {value}
    </span>
  );
}
