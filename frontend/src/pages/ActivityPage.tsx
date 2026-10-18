import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useAuditLogs } from '@/hooks/useData';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { AuditLog } from '@/types';

const ENTITY_LABELS: Record<string, string> = {
  incident: 'Incident', assignment: 'Assignment', team: 'Team', resource: 'Resource', shelter: 'Shelter',
  alert: 'Alert', profile: 'User', situation_report: 'Situation report',
};
const WINDOWS = [[1, 'Last hour'], [24, 'Last 24 hours'], [168, 'Last 7 days'], [0, 'All time']] as const;

function entityLink(log: AuditLog) {
  if (!log.entity_id) return null;
  if (log.entity_type === 'incident') return `/incidents/${log.entity_id}`;
  const pages: Record<string, string> = { team: '/teams', resource: '/resources', shelter: '/shelters', alert: '/alerts', profile: '/admin/users', situation_report: '/reports/summary' };
  return pages[log.entity_type] ?? null;
}

function changeSummary(log: AuditLog) {
  const next = log.new_values ?? {};
  const prev = log.previous_values ?? {};
  return Object.keys(next)
    .filter((key) => !['reasons', 'assignment_id', 'invitation_id'].includes(key) && typeof next[key] !== 'object')
    .slice(0, 4)
    .map((key) => (key in prev ? `${key.replace(/_/g, ' ')}: ${String(prev[key])} → ${String(next[key])}` : `${key.replace(/_/g, ' ')}: ${String(next[key])}`));
}

// Who did what, when and why, across the whole operation.
export function ActivityPage() {
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [hours, setHours] = useState<number>(24);
  const logs = useAuditLogs(entityType || undefined, undefined, 300, { actorId: actorId || undefined, sinceHours: hours || undefined });

  const people = new Map((logs.data ?? []).filter((l) => l.actor_user_id && l.profiles).map((l) => [l.actor_user_id!, l.profiles!.full_name || l.profiles!.email]));

  return (
    <DashboardLayout title="Activity history" subtitle="Every recorded action, with who did it and why">
      <div className="card card-body mb-4 flex flex-wrap gap-3">
        <select className="select w-auto" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Everything</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="select w-auto" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Anyone</option>
          {[...people].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="select w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="text-xs text-neutral-400 self-center ml-auto">{logs.data?.length ?? 0} records{logs.data?.length === 300 ? ' (latest 300)' : ''}</span>
      </div>

      {logs.isLoading ? <Skeleton className="h-64 w-full" /> : logs.data?.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase tracking-wide">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Reason</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {logs.data.map((log) => {
                const link = entityLink(log);
                const who = log.profiles ? log.profiles.full_name || log.profiles.email : log.actor_user_id ? 'Unknown user' : log.actor === 'guest' ? 'Public reporter' : 'System';
                return (
                  <tr key={log.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap" title={formatDateTime(log.created_at)}>{timeAgo(log.created_at)}</td>
                    <td className="px-4 py-3 text-xs"><span className="font-medium text-neutral-800">{who}</span>{log.actor_role && <span className="block text-neutral-400">{log.actor_role}</span>}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-medium text-neutral-700">{log.action.replace(/_/g, ' ')}</span>
                      <span className="block text-neutral-400">{link ? <Link className="underline" to={link}>{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</Link> : ENTITY_LABELS[log.entity_type] ?? log.entity_type}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{changeSummary(log).map((line) => <div key={line}>{line}</div>)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500 max-w-xs">{log.reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><EmptyState icon={<History size={38} />} title="No activity" message="Nothing recorded for these filters." /></div>
      )}
    </DashboardLayout>
  );
}
