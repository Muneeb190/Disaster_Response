import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, X, AlertTriangle, RefreshCw, Siren, Users,
  MapPin, Clock, FileText, Activity, AlertOctagon, ShieldCheck, MessageCircleQuestion
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MiniMap } from '@/components/map/IncidentMap';
import { PriorityBadge, StatusBadge, VerificationBadge, TriStateBadge, TeamStatusBadge, AssignmentStatusBadge } from '@/components/ui/Badges';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { WhyPriorityPanel, ConfidenceBadge, ConfidencePanel, UrgentCheckBadge } from '@/components/incident/PriorityPanels';
import { Skeleton, EmptyState, LoadingSpinner, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import {
  useIncident, useUpdateIncident, useRecalculatePriority, useTeamRecommendations,
  useTeams, useResources, useCreateAssignment, useAssignmentsForIncident,
  useCancelAssignment, useUpdateAssignment, useEscalations, useAuditLogs,
} from '@/hooks/useData';
import { parseLocation, INCIDENT_TYPE_LABELS, STATUS_LABELS } from '@/types';
import type { IncidentStatus, VerificationStatus } from '@/types';
import { formatDateTime, timeAgo } from '@/lib/utils';

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const incident = useIncident(id!);
  const recommendations = useTeamRecommendations(id!);
  const teams = useTeams();
  const resources = useResources();
  const assignments = useAssignmentsForIncident(id!);
  const escalations = useEscalations(id!);
  const auditLogs = useAuditLogs('incident', id!, 20);
  const updateIncident = useUpdateIncident();
  const recalcPriority = useRecalculatePriority();
  const createAssignment = useCreateAssignment();
  const cancelAssignment = useCancelAssignment();
  const updateAssignment = useUpdateAssignment();

  const [assignModal, setAssignModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<IncidentStatus | null>(null);

  if (incident.isLoading) {
    return <DashboardLayout title="Loading incident..."><Skeleton className="h-96 w-full" /></DashboardLayout>;
  }
  if (incident.error) {
    return <DashboardLayout title="Error"><ErrorState message="Failed to load incident" onRetry={() => incident.refetch()} /></DashboardLayout>;
  }
  if (!incident.data) {
    return <DashboardLayout title="Not Found"><EmptyState title="Incident not found" /></DashboardLayout>;
  }

  const inc = incident.data;
  const pos = parseLocation(inc.location);
  const activeAssignment = assignments.data?.find((a) => ['assigned', 'dispatched'].includes(a.status));
  const assignedTeam = teams.data?.find((t) => t.id === inc.assigned_team_id);

  const handleVerify = async (status: VerificationStatus) => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { verification_status: status } });
      toast(`Report ${status}`, 'success');
    } catch { toast('Failed to update verification', 'error'); }
  };

  const handleStatusChange = async (status: IncidentStatus) => {
    setConfirmStatus(null);
    try {
      const updates: Record<string, unknown> = { status };
      if (status === 'resolved') {
        // If there's an active assignment, mark it completed
        if (activeAssignment) {
          await updateAssignment.mutateAsync({ id: activeAssignment.id, updates: { status: 'completed', completed_at: new Date().toISOString() } });
        }
      }
      await updateIncident.mutateAsync({ id: inc.id, updates });
      toast(`Status changed to ${STATUS_LABELS[status]}`, 'success');
    } catch { toast('Failed to update status', 'error'); }
  };

  const handleRecalculate = async () => {
    try {
      const result = await recalcPriority.mutateAsync(inc.id);
      if (result.escalated) {
        toast(`Priority recalculated — escalated to ${result.new_level} (score ${result.new_score})`, 'warning');
      } else {
        toast(`Priority recalculated: ${result.new_level} (score ${result.new_score})`, 'success');
      }
    } catch { toast('Failed to recalculate priority', 'error'); }
  };

  const handleSimulateEscalation = async () => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { people_trapped: 'yes', danger_increasing: 'yes' } });
      const result = await recalcPriority.mutateAsync(inc.id);
      if (result.escalated) {
        toast(`Escalation simulated: priority increased to ${result.new_level}`, 'warning');
      } else {
        toast('Conditions updated — no escalation detected', 'info');
      }
    } catch { toast('Failed to simulate escalation', 'error'); }
  };

  const handleAssign = async () => {
    setConfirmAssign(false);
    try {
      await createAssignment.mutateAsync({ incidentId: inc.id, teamId: selectedTeam, resourceIds: selectedResources });
      toast('Team assigned successfully', 'success');
      setAssignModal(false);
      setSelectedTeam('');
      setSelectedResources([]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to assign team', 'error');
    }
  };

  const handleCancelAssignment = async (reason: string) => {
    if (!confirmCancel) return;
    try {
      await cancelAssignment.mutateAsync({ assignmentId: confirmCancel, reason });
      toast('Assignment cancelled — team and resources released', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel assignment', 'error');
    }
    setConfirmCancel(null);
  };

  const handleSaveNotes = async () => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { coordinator_notes: notesValue } });
      toast('Notes saved', 'success');
      setNotesModal(false);
    } catch { toast('Failed to save notes', 'error'); }
  };

  return (
    <DashboardLayout
      title={inc.report_code}
      subtitle={`${INCIDENT_TYPE_LABELS[inc.type]} — reported ${timeAgo(inc.created_at)}`}
      actions={
        <Link to="/incidents" className="btn-ghost btn-sm">
          <ArrowLeft size={16} /> Back to list
        </Link>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Priority + status card */}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${inc.life_threatening ? 'bg-red-50' : 'bg-blue-50'}`}>
                  {inc.life_threatening ? <AlertOctagon size={24} className="text-red-600" /> : <Siren size={24} className="text-blue-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <PriorityBadge level={inc.priority_level} />
                    <span className="text-lg font-bold text-neutral-800">{inc.priority_score}/100</span>
                    <ConfidenceBadge level={inc.confidence_level} score={inc.confidence_score} />
                    {inc.needs_urgent_check && <UrgentCheckBadge />}
                  </div>
                  <p className="text-xs text-neutral-400">Risk score — decision support only</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={inc.status} />
                <VerificationBadge status={inc.verification_status} />
              </div>
            </div>

            <div className="mb-3">
              <WhyPriorityPanel incident={inc} />
            </div>

            {inc.life_threatening && (
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg p-2.5 mb-3 border border-red-100">
                <AlertTriangle size={14} />
                Flagged for urgent review: immediate danger to life reported. Score is decision support only — coordinator judgment required.
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={handleRecalculate} disabled={recalcPriority.isPending}>
                <RefreshCw size={14} /> Recalculate Priority
              </button>
              <button className="btn-secondary btn-sm" onClick={handleSimulateEscalation} disabled={updateIncident.isPending}>
                <AlertTriangle size={14} /> Simulate Worsening
              </button>
              <select
                className="select btn-sm w-auto"
                value=""
                onChange={(e) => {
                  if (e.target.value) setConfirmStatus(e.target.value as IncidentStatus);
                  e.target.value = '';
                }}
              >
                <option value="">Change Status...</option>
                <option value="verified">Mark Verified</option>
                <option value="assigned">Mark Assigned</option>
                <option value="dispatched">Mark Dispatched</option>
                <option value="resolved">Mark Resolved</option>
                <option value="cancelled">Cancel Incident</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="card card-body">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2">
              <FileText size={14} /> Description
            </h3>
            <p className="text-sm text-neutral-700 leading-relaxed">{inc.description}</p>
            {inc.area_landmark && (
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-3">
                <MapPin size={14} /> {inc.area_landmark}
              </div>
            )}
            {inc.followup_question && (
              <div className="text-xs bg-neutral-50 rounded-lg p-2.5 mt-3 flex items-start gap-2">
                <MessageCircleQuestion size={14} className="text-primary-600 flex-shrink-0 mt-0.5" />
                <span>
                  Follow-up asked: “{inc.followup_question}” —{' '}
                  <strong>
                    {inc.followup_skipped || !inc.followup_answer
                      ? 'skipped by reporter'
                      : inc.followup_answer === 'unknown' ? 'not sure' : inc.followup_answer}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Reported conditions */}
          <div className="card card-body">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Reported Conditions</h3>
            <div className="flex flex-wrap gap-2">
              <TriStateBadge value={inc.people_trapped} label="People Trapped" />
              <TriStateBadge value={inc.injuries_reported} label="Injuries" />
              <TriStateBadge value={inc.vulnerable_people} label="Vulnerable" />
              <TriStateBadge value={inc.danger_increasing} label="Worsening" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div className="flex items-center gap-2"><Users size={14} className="text-neutral-400" /> {inc.people_affected} people affected</div>
              <div className="flex items-center gap-2"><Clock size={14} className="text-neutral-400" /> {formatDateTime(inc.created_at)}</div>
            </div>
          </div>

          {/* Map */}
          {pos && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-2">Location</h3>
              <MiniMap position={pos} />
            </div>
          )}

          {/* Assignment & Recommendations */}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Users size={14} /> Team Assignment
              </h3>
              {!activeAssignment && (
                <button className="btn-primary btn-sm" onClick={() => setAssignModal(true)}>
                  <Users size={14} /> Assign Team
                </button>
              )}
            </div>

            {/* Active assignment */}
            {activeAssignment && assignedTeam ? (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-700">{assignedTeam.name}</p>
                    <p className="text-xs text-neutral-400">{assignedTeam.team_code} • {assignedTeam.capabilities.join(', ')}</p>
                  </div>
                  <AssignmentStatusBadge status={activeAssignment.status} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {activeAssignment.status === 'assigned' && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => updateAssignment.mutateAsync({ id: activeAssignment.id, updates: { status: 'dispatched', dispatched_at: new Date().toISOString() } }).then(() => toast('Team dispatched', 'success')).catch(() => toast('Failed to dispatch', 'error'))}
                    >
                      <ArrowRight size={14} /> Dispatch
                    </button>
                  )}
                  <button className="btn-danger btn-sm" onClick={() => setConfirmCancel(activeAssignment.id)}>
                    <X size={14} /> Cancel Assignment
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 mb-3">No team assigned to this incident yet.</p>
            )}

            {/* Recommendations */}
            {!activeAssignment && (
              <>
                <p className="text-xs font-medium text-neutral-500 mb-2 flex items-center gap-1.5">
                  <ShieldCheck size={12} /> Recommended Teams (ranked by capability + distance)
                </p>
                {recommendations.isLoading ? (
                  <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : recommendations.data && recommendations.data.length > 0 ? (
                  <div className="space-y-2">
                    {recommendations.data.slice(0, 4).map((rec, i) => (
                      <div key={rec.team_id} className={`rounded-lg p-2.5 border ${i === 0 ? 'border-green-300 bg-green-50' : 'border-neutral-200 bg-neutral-50'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {i === 0 && <span className="badge-success text-[10px]">Best match</span>}
                            <span className="text-xs font-medium text-neutral-700">{rec.team_name}</span>
                            <span className="text-[10px] text-neutral-400">{rec.team_code}</span>
                          </div>
                          <span className="text-xs text-neutral-500">{rec.distance_km} km</span>
                        </div>
                        <p className="text-[10px] text-neutral-500">{rec.recommendation_reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">No available teams with matching capabilities.</p>
                )}
              </>
            )}
          </div>

          {/* Coordinator notes */}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-neutral-700">Coordinator Notes</h3>
              <button className="btn-ghost btn-sm" onClick={() => { setNotesValue(inc.coordinator_notes || ''); setNotesModal(true); }}>
                <FileText size={14} /> {inc.coordinator_notes ? 'Edit' : 'Add'}
              </button>
            </div>
            {inc.coordinator_notes ? (
              <p className="text-sm text-neutral-600">{inc.coordinator_notes}</p>
            ) : (
              <p className="text-xs text-neutral-400">No notes added.</p>
            )}
          </div>
        </div>

        {/* Right: Escalation history, audit trail, contact */}
        <div className="space-y-4">
          {/* Reporter info */}
          {(inc.reporter_name || inc.reporter_phone) && (
            <div className="card card-body">
              <h3 className="text-sm font-semibold text-neutral-700 mb-2">Reporter (Confidential)</h3>
              <div className="space-y-1 text-xs text-neutral-600">
                {inc.reporter_name && <p>Name: {inc.reporter_name}</p>}
                {inc.reporter_phone && <p>Phone: {inc.reporter_phone}</p>}
              </div>
            </div>
          )}

          <ConfidencePanel incident={inc} />

          {/* Verification controls */}
          <div className="card card-body">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
              <ShieldCheck size={14} /> Verification
            </h3>
            <div className="flex flex-wrap gap-2">
              <button className={`btn btn-sm ${inc.verification_status === 'verified' ? 'bg-green-100 text-green-700' : 'btn-secondary'}`} onClick={() => handleVerify('verified')}>
                <Check size={14} /> Verify
              </button>
              <button className={`btn btn-sm ${inc.verification_status === 'disputed' ? 'bg-red-100 text-red-700' : 'btn-secondary'}`} onClick={() => handleVerify('disputed')}>
                <X size={14} /> Dispute
              </button>
              <button className={`btn btn-sm ${inc.verification_status === 'flagged' ? 'bg-yellow-100 text-yellow-700' : 'btn-secondary'}`} onClick={() => handleVerify('flagged')}>
                <AlertTriangle size={14} /> Flag
              </button>
            </div>
          </div>

          {/* Escalation history */}
          <div className="card">
            <div className="px-4 py-3 border-b border-neutral-200">
              <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <AlertOctagon size={14} /> Escalation History
              </h3>
            </div>
            <div className="p-4">
              {escalations.data && escalations.data.length > 0 ? (
                <div className="space-y-3">
                  {escalations.data.map((esc) => (
                    <div key={esc.id} className="text-xs border-l-2 border-orange-300 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-neutral-700">{esc.previous_score} → {esc.new_score}</span>
                        {esc.new_level && <PriorityBadge level={esc.new_level} />}
                      </div>
                      <p className="text-neutral-500">{esc.reason}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{timeAgo(esc.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-400">No escalations recorded.</p>
              )}
            </div>
          </div>

          {/* Audit trail */}
          <div className="card">
            <div className="px-4 py-3 border-b border-neutral-200">
              <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                <Activity size={14} /> Audit Trail
              </h3>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto">
              {auditLogs.data && auditLogs.data.length > 0 ? (
                <div className="space-y-2">
                  {auditLogs.data.map((log) => (
                    <div key={log.id} className="text-xs">
                      <p className="text-neutral-700"><span className="font-medium">{log.actor}</span> — {log.action.replace(/_/g, ' ')}</p>
                      {log.reason && <p className="text-neutral-400">{log.reason}</p>}
                      <p className="text-[10px] text-neutral-400">{timeAgo(log.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-400">No audit records.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Team Modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Rescue Team" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Select a team and optional resources to assign to this incident. The assignment is atomic —
            the team will be reserved and resources deducted instantly.
          </p>

          {/* Team selection */}
          <div>
            <label className="label">Select Team</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recommendations.data && recommendations.data.length > 0 ? (
                recommendations.data.map((rec) => {
                  const team = teams.data?.find((t) => t.id === rec.team_id);
                  return (
                    <button
                      key={rec.team_id}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${selectedTeam === rec.team_id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                      onClick={() => setSelectedTeam(rec.team_id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-neutral-700">{rec.team_name}</span>
                        <div className="flex items-center gap-2">
                          {team && <TeamStatusBadge status={team.status} />}
                          <span className="text-xs text-neutral-500">{rec.distance_km} km</span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500">{rec.recommendation_reason}</p>
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-neutral-400">No available teams. All teams may be assigned or offline.</p>
              )}
            </div>
          </div>

          {/* Resource selection */}
          <div>
            <label className="label">Reserve Resources <span className="text-neutral-400 font-normal">(optional)</span></label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {resources.data?.filter((r) => r.quantity_available > 0).map((res) => (
                <label key={res.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300"
                    checked={selectedResources.includes(res.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedResources([...selectedResources, res.id]);
                      else setSelectedResources(selectedResources.filter((r) => r !== res.id));
                    }}
                  />
                  <span className="text-sm text-neutral-700 flex-1">{res.name}</span>
                  <span className="text-xs text-green-600">{res.quantity_available} avail</span>
                  <span className="text-xs text-neutral-400 capitalize">{res.type}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
            <button className="btn-secondary" onClick={() => setAssignModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={!selectedTeam || createAssignment.isPending} onClick={() => setConfirmAssign(true)}>
              {createAssignment.isPending ? <LoadingSpinner size={16} /> : <Check size={16} />}
              Confirm Assignment
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmAssign}
        onClose={() => setConfirmAssign(false)}
        onConfirm={handleAssign}
        title="Confirm Assignment"
        message="This will reserve the selected team and resources. This action is atomic and cannot be partially undone."
        confirmLabel="Assign"
      />

      <CancelReasonDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancelAssignment}
      />

      <ConfirmDialog
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        onConfirm={() => confirmStatus && handleStatusChange(confirmStatus)}
        title="Change Status"
        message={`Are you sure you want to change this incident's status to "${confirmStatus ? STATUS_LABELS[confirmStatus] : ''}"?`}
        confirmLabel="Change Status"
      />

      {/* Notes modal */}
      <Modal open={notesModal} onClose={() => setNotesModal(false)} title="Coordinator Notes" size="sm">
        <textarea
          className="input resize-none"
          rows={5}
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          placeholder="Add notes visible to coordinators only..."
        />
        <div className="flex justify-end gap-3 mt-4">
          <button className="btn-secondary" onClick={() => setNotesModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSaveNotes}>Save Notes</button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

function CancelReasonDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Cancel Assignment" size="sm">
      <p className="text-sm text-neutral-600 mb-3">
        Cancelling will release the team and reserved resources back to the available pool.
      </p>
      <input className="input" placeholder="Reason for cancellation..." value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-secondary" onClick={onClose}>Keep Assignment</button>
        <button className="btn-danger" onClick={() => { onConfirm(reason); setReason(''); onClose(); }}>
          Cancel Assignment
        </button>
      </div>
    </Modal>
  );
}
