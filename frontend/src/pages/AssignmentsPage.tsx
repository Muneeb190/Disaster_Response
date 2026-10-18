import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, X, Truck, Check } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AssignmentStatusBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { ReasonDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast-context';
import { useAssignments, useIncidents, useTeams, useResources, useSetAssignmentStatus } from '@/hooks/useData';
import type { Assignment, AssignmentStatus } from '@/types';
import { formatDateTime } from '@/lib/utils';

export function AssignmentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const assignments = useAssignments();
  const incidents = useIncidents({ limit: 1000 });
  const teams = useTeams();
  const resources = useResources();
  const setStatus = useSetAssignmentStatus();
  const [pending, setPending] = useState<{ id: string; status: 'completed' | 'cancelled' } | null>(null);

  const changeStatus = async (id: string, status: AssignmentStatus, reason?: string) => {
    try {
      await setStatus.mutateAsync({ id, status, reason });
      toast(status === 'dispatched' ? 'Team dispatched' : status === 'completed' ? 'Assignment completed — team and resources released' : 'Assignment cancelled — team and resources released', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to update assignment', 'error'); }
  };

  const incMap = new Map(incidents.data?.map((i) => [i.id, i]));
  const teamMap = new Map(teams.data?.map((t) => [t.id, t]));
  const resMap = new Map(resources.data?.map((r) => [r.id, r]));

  const active = assignments.data?.filter((a) => ['assigned', 'dispatched'].includes(a.status)) ?? [];
  const historical = assignments.data?.filter((a) => ['completed', 'cancelled'].includes(a.status)) ?? [];

  const renderAssignment = (a: Assignment) => {
    const inc = incMap.get(a.incident_id);
    const team = teamMap.get(a.team_id);
    const resNames = a.resource_ids.map((rid) => resMap.get(rid)?.name).filter(Boolean);

    return (
      <div key={a.id} className="card card-body">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <GitBranch size={18} className="text-primary-600" />
            </div>
            <div className="min-w-0">
              <button className="text-sm font-semibold text-neutral-800 hover:underline" onClick={() => navigate(`/incidents/${a.incident_id}`)}>
                {inc?.report_code ?? 'Unknown'}
              </button>
              <p className="text-xs text-neutral-500 truncate">
                {team?.name ?? 'Unknown team'} → {inc?.area_landmark || inc?.description.slice(0, 40) || '—'}
              </p>
            </div>
          </div>
          <AssignmentStatusBadge status={a.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-neutral-600">
          <div>
            <span className="text-neutral-400">Assigned:</span> {formatDateTime(a.assigned_at)}
          </div>
          {a.dispatched_at && (
            <div>
              <span className="text-neutral-400">Dispatched:</span> {formatDateTime(a.dispatched_at)}
            </div>
          )}
          {a.completed_at && (
            <div>
              <span className="text-neutral-400">Completed:</span> {formatDateTime(a.completed_at)}
            </div>
          )}
          {a.cancelled_at && (
            <div>
              <span className="text-neutral-400">Cancelled:</span> {formatDateTime(a.cancelled_at)}
            </div>
          )}
        </div>

        {resNames.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <span className="text-xs text-neutral-400">Resources:</span>
            {resNames.map((name) => (
              <span key={name} className="badge-neutral text-[10px]">{name}</span>
            ))}
          </div>
        )}

        {a.cancellation_reason && (
          <p className="text-xs text-neutral-500 mt-2">Cancel reason: {a.cancellation_reason}</p>
        )}

        {/* Actions */}
        {['assigned', 'dispatched'].includes(a.status) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
            {a.status === 'assigned' && (
              <button className="btn-secondary btn-sm" disabled={setStatus.isPending} onClick={() => void changeStatus(a.id, 'dispatched')}>
                <Truck size={14} /> Dispatch
              </button>
            )}
            <button className="btn-secondary btn-sm" disabled={setStatus.isPending} onClick={() => setPending({ id: a.id, status: 'completed' })}>
              <Check size={14} /> Complete
            </button>
            <button className="btn-danger btn-sm ml-auto" disabled={setStatus.isPending} onClick={() => setPending({ id: a.id, status: 'cancelled' })}>
              <X size={14} /> Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout title="Assignments" subtitle="Active and historical rescue team assignments">
      {assignments.isLoading || incidents.isLoading || teams.isLoading ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse-soft" />
              Active Assignments ({active.length})
            </h3>
            {active.length > 0 ? (
              <div className="grid lg:grid-cols-2 gap-4">
                {active.map(renderAssignment)}
              </div>
            ) : (
              <div className="card"><EmptyState title="No active assignments" message="Assign a team from an incident's detail page." /></div>
            )}
          </div>

          {/* Historical */}
          {historical.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">History</h3>
              <div className="grid lg:grid-cols-2 gap-4">
                {historical.map(renderAssignment)}
              </div>
            </div>
          )}
        </div>
      )}
      <ReasonDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={(reason) => pending && void changeStatus(pending.id, pending.status, reason)}
        title={pending?.status === 'cancelled' ? 'Cancel assignment' : 'Complete assignment'}
        message={pending?.status === 'cancelled' ? 'The team and reserved resources return to the available pool and the incident goes back to the queue.' : 'Resolves the incident and makes the team and reserved resources available again.'}
        confirmLabel={pending?.status === 'cancelled' ? 'Cancel assignment' : 'Mark completed'}
        danger={pending?.status === 'cancelled'}
        required={pending?.status === 'cancelled'}
      />
    </DashboardLayout>
  );
}
