import { History } from 'lucide-react';
import { useIncidentEvents } from '@/hooks/useData';
import { Skeleton } from '@/components/ui/States';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { IncidentEvent } from '@/types';

const FACT_LABELS: Record<string, string> = {
  type: 'type',
  people_affected: 'people affected',
  people_trapped: 'people trapped',
  injuries_reported: 'injuries',
  vulnerable_people: 'vulnerable people',
  danger_increasing: 'danger increasing',
  area_landmark: 'area',
};

const DOT: Record<string, string> = {
  reported: 'bg-blue-500',
  priority_changed: 'bg-orange-500',
  team_assigned: 'bg-amber-500',
  assignment_dispatched: 'bg-blue-600',
  assignment_completed: 'bg-green-600',
  assignment_cancelled: 'bg-red-500',
};

function describe(event: IncidentEvent): string {
  switch (event.event_type) {
    case 'reported': return 'Report received';
    case 'status_changed': return `Status ${event.from_value} → ${event.to_value}`;
    case 'verification_changed': return `Verification ${event.from_value} → ${event.to_value}`;
    case 'priority_changed': return `Priority ${event.from_value} → ${event.to_value}`;
    case 'notes_updated': return 'Coordinator notes updated';
    case 'team_assigned': return `Team assigned: ${event.to_value}`;
    case 'assignment_dispatched': return `Team dispatched: ${event.to_value}`;
    case 'assignment_completed': return `Assignment completed: ${event.to_value}`;
    case 'assignment_cancelled': return `Assignment cancelled: ${event.to_value}`;
    case 'facts_updated': {
      const changes = Object.entries((event.details ?? {}) as Record<string, { from: unknown; to: unknown }>)
        .map(([key, change]) => `${FACT_LABELS[key] ?? key} ${String(change.from ?? '—')} → ${String(change.to ?? '—')}`);
      return `Facts updated: ${changes.join(', ')}`;
    }
    default: return event.event_type.replace(/_/g, ' ');
  }
}

// Append-only history of everything that happened to an incident, with who and when.
export function IncidentTimeline({ incidentId }: { incidentId: string }) {
  const events = useIncidentEvents(incidentId);
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2"><History size={14} /> Timeline</h3>
      </div>
      <div className="p-4 max-h-[28rem] overflow-y-auto">
        {events.isLoading ? <Skeleton className="h-24 w-full" /> : events.data?.length ? (
          <ol className="relative border-l border-neutral-200 ml-1.5 space-y-4">
            {events.data.map((event) => (
              <li key={event.id} className="ml-4 text-xs">
                <span className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full ${DOT[event.event_type] ?? 'bg-neutral-400'}`} />
                <p className="text-neutral-800 font-medium">{describe(event)}</p>
                {event.reason && event.event_type !== 'reported' && <p className="text-neutral-500 mt-0.5">“{event.reason}”</p>}
                <p className="text-[10px] text-neutral-400 mt-0.5" title={formatDateTime(event.created_at)}>
                  {event.profiles ? event.profiles.full_name || event.profiles.email : event.actor_user_id ? 'Unknown user' : 'System'} · {timeAgo(event.created_at)}
                </p>
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-neutral-400">No events recorded.</p>}
      </div>
    </div>
  );
}
