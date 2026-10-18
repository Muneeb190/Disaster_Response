import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, X, AlertTriangle, RefreshCw, Users,
  MapPin, Clock, FileText, ShieldCheck, PencilLine, CheckCircle2, MessageCircleQuestion
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PriorityGauge } from '@/components/ui/PriorityGauge';
import { MiniMap } from '@/components/map/IncidentMap';
import { IncidentTimeline } from '@/components/incident/IncidentTimeline';
import { SuitableShelters } from '@/components/incident/SuitableShelters';
import { WhyPriorityPanel, ConfidenceBadge, ConfidencePanel, UrgentCheckBadge } from '@/components/incident/PriorityPanels';
import { DemoBadge, StatusBadge, VerificationBadge, TriStateBadge, TeamStatusBadge, AssignmentStatusBadge } from '@/components/ui/Badges';
import { Modal, ConfirmDialog, ReasonDialog } from '@/components/ui/Modal';
import { Skeleton, EmptyState, LoadingSpinner, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import {
  useIncident, useUpdateIncident, useRecalculatePriority, useTeamRecommendations,
  useTeams, useResources, useCreateAssignment, useAssignmentsForIncident, useSetAssignmentStatus, useOverrideIncidentPriority,
} from '@/hooks/useData';
import { parseLocation, INCIDENT_TYPE_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from '@/types';
import type { Incident, IncidentStatus, IncidentType, PriorityLevel, TriState, VerificationStatus } from '@/types';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { TranscriptText } from '@/components/incident/TranscriptText';
import { DuplicateReportsPanel } from '@/components/incident/DuplicateReportsPanel';
import { EvacuationRoutePanel } from '@/components/incident/EvacuationRoutePanel';
import { IncidentEvidencePanel } from '@/components/incident/IncidentEvidencePanel';
import { FieldResponsePanel } from '@/components/incident/FieldResponsePanel';
import { ASSIGNMENT_FIELD_STATUS_LABELS } from '@/types';
import { TeamEtaPanel } from '@/components/incident/TeamEtaPanel';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const incident = useIncident(id!);
  const recommendations = useTeamRecommendations(id!);
  const teams = useTeams();
  const resources = useResources();
  const assignments = useAssignmentsForIncident(id!);
  const updateIncident = useUpdateIncident();
  const recalcPriority = useRecalculatePriority();
  const overridePriority = useOverrideIncidentPriority();
  const createAssignment = useCreateAssignment();
  const setAssignmentStatus = useSetAssignmentStatus();

  const [assignModal, setAssignModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [statusChange, setStatusChange] = useState<IncidentStatus | null>(null);
  const [verifyChange, setVerifyChange] = useState<VerificationStatus | null>(null);
  const [factsModal, setFactsModal] = useState(false);
  const [priorityModal, setPriorityModal] = useState(false);

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

  const handleVerify = async (status: VerificationStatus, reason: string) => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { verification_status: status }, reason });
      toast(`Verification set to ${VERIFICATION_LABELS[status]}`, 'success');
    } catch (err) { toast(errorMessage(err, 'Failed to update verification'), 'error'); }
  };

  // Resolving or cancelling also closes the active assignment and frees the team (done in the database).
  const handleStatusChange = async (status: IncidentStatus, reason: string) => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { status }, reason });
      toast(`Status changed to ${STATUS_LABELS[status]}`, 'success');
    } catch (err) { toast(errorMessage(err, 'Failed to update status'), 'error'); }
  };

  const handleAssignmentStatus = async (assignmentId: string, status: 'dispatched' | 'completed' | 'cancelled', reason?: string) => {
    try {
      await setAssignmentStatus.mutateAsync({ id: assignmentId, status, reason });
      toast(status === 'dispatched' ? 'Team dispatched' : status === 'completed' ? 'Assignment completed — team and resources released' : 'Assignment cancelled — team and resources released', 'success');
    } catch (err) { toast(errorMessage(err, 'Failed to update assignment'), 'error'); }
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

  const handleUpdateFacts = async (updates: Partial<Incident>, reason: string) => {
    try {
      const updated = await updateIncident.mutateAsync({ id: inc.id, updates, reason });
      setFactsModal(false);
      if (updated.priority_score > inc.priority_score) toast(`Facts updated — priority rose to ${updated.priority_level} (${updated.priority_score})`, 'warning');
      else toast(`Facts updated — priority ${updated.priority_level} (${updated.priority_score})`, 'success');
    } catch (err) { toast(errorMessage(err, 'Failed to update facts'), 'error'); }
  };

  const handlePriorityOverride = async (level: PriorityLevel | null, reason: string) => {
    try {
      await overridePriority.mutateAsync({ incidentId: inc.id, level, reason });
      setPriorityModal(false);
      toast(level ? `Priority overridden to ${level}` : 'Priority override cleared; calculated priority restored', 'success');
    } catch (err) { toast(errorMessage(err, 'Failed to change priority'), 'error'); }
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

  const handleSaveNotes = async () => {
    try {
      await updateIncident.mutateAsync({ id: inc.id, updates: { coordinator_notes: notesValue } });
      toast('Notes saved', 'success');
      setNotesModal(false);
    } catch (err) { toast(errorMessage(err, 'Failed to save notes'), 'error'); }
  };

  return (
    <DashboardLayout
      title={inc.report_code}
      subtitle={`${INCIDENT_TYPE_LABELS[inc.type]}${inc.area_landmark ? `, ${inc.area_landmark}` : ''}. Reported ${timeAgo(inc.created_at)}.`}
      actions={
        <Link to="/incidents" className="btn-ghost btn-sm">
          <ArrowLeft size={16} aria-hidden="true" />All incidents
        </Link>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Priority + status card */}
          <div className="card card-body">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-end gap-5">
                <PriorityGauge score={inc.priority_score} level={inc.priority_level} size="lg" />
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConfidenceBadge level={inc.confidence_level} score={inc.confidence_score} />
                    {inc.needs_urgent_check && <UrgentCheckBadge />}
                    {inc.incident_origin === 'proactive_check' && <span className="badge-info">Welfare check, nobody reported</span>}
                    {inc.is_proxy_report && <span className="badge-neutral">Reported for someone else{inc.proxy_relationship ? ` (${inc.proxy_relationship})` : ''}</span>}
                    {inc.is_demo && <DemoBadge />}
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">Score out of 100. It supports your judgment and never replaces it.</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={inc.status} />
                <VerificationBadge status={inc.verification_status} />
              </div>
            </div>

            <div className="mb-3">
              <WhyPriorityPanel incident={inc} />
            </div>

            {inc.life_threatening && (
              <div className="mb-3 flex items-center gap-2 rounded-control border border-critical-line bg-critical-soft p-3 text-[15px] text-critical">
                <AlertTriangle size={18} aria-hidden="true" className="shrink-0" />
                Danger to life was reported. Review this one yourself before anything else.
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={handleRecalculate} disabled={recalcPriority.isPending}>
                <RefreshCw size={14} aria-hidden="true" />Recalculate priority
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setFactsModal(true)} disabled={updateIncident.isPending}>
                <PencilLine size={14} /> Update facts
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setPriorityModal(true)} disabled={overridePriority.isPending}>
                <AlertTriangle size={14} /> {inc.priority_override_level ? 'Change priority override' : 'Override priority'}
              </button>
              <select
                className="select btn-sm w-auto"
                value=""
                onChange={(e) => {
                  if (e.target.value) setStatusChange(e.target.value as IncidentStatus);
                  e.target.value = '';
                }}
              >
                <option value="">Change status…</option>
                {inc.status !== 'reported' && <option value="reported">Reopen as reported</option>}
                {inc.status !== 'verified' && <option value="verified">Mark verified</option>}
                {inc.status !== 'resolved' && <option value="resolved">Mark resolved</option>}
                {inc.status !== 'cancelled' && <option value="cancelled">Cancel incident</option>}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="card card-body">
            <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
              <FileText size={14} /> Description
            </h3>
            <p className="text-sm text-neutral-700 leading-relaxed">{inc.description}</p>
            {inc.input_mode === 'voice' && inc.voice_transcript && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="mb-1 text-xs font-semibold text-blue-700">
                  English voice transcript
                </p>
                <TranscriptText text={inc.transcript_english || inc.voice_transcript} language="en" className="text-sm text-neutral-800" />
              </div>
            )}
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
            {inc.ai_extracted && (Array.isArray(inc.ai_extracted.immediate_needs) || Array.isArray(inc.ai_extracted.uncertainties)) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Array.isArray(inc.ai_extracted.immediate_needs) && inc.ai_extracted.immediate_needs.length > 0 && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs"><strong className="text-red-800">Reported immediate needs</strong><p className="mt-1 text-neutral-700">{inc.ai_extracted.immediate_needs.map(String).join(', ')}</p></div>}
                {Array.isArray(inc.ai_extracted.uncertainties) && inc.ai_extracted.uncertainties.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><strong className="text-amber-900">Still needs verification</strong><ul className="mt-1 list-disc pl-4 text-amber-900">{inc.ai_extracted.uncertainties.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul></div>}
              </div>
            )}
          </div>

          <IncidentEvidencePanel incidentId={inc.id} legacyPhotoUrl={inc.photo_url} />
          <FieldResponsePanel incidentId={inc.id} />

          <DuplicateReportsPanel incident={inc} />
          <EvacuationRoutePanel incident={inc} />

          {/* Reported conditions */}
          <div className="card card-body">
            <h3 className="mb-3 font-display text-lg font-semibold">Reported Conditions</h3>
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
              <h3 className="mb-2 font-display text-lg font-semibold">Location</h3>
              <MiniMap position={pos} />
            </div>
          )}

          <SuitableShelters position={pos} needVulnerable={inc.vulnerable_people === 'yes'} />

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
                {activeAssignment.field_status && <p className="mt-2 text-xs text-blue-800">Field progress: <strong>{ASSIGNMENT_FIELD_STATUS_LABELS[activeAssignment.field_status]}</strong>{activeAssignment.last_field_update_at ? ` · updated ${timeAgo(activeAssignment.last_field_update_at)}` : ''}</p>}
                <div className="flex items-center gap-2 mt-2">
                  {activeAssignment.status === 'assigned' && (
                    <button className="btn-secondary btn-sm" disabled={setAssignmentStatus.isPending} onClick={() => void handleAssignmentStatus(activeAssignment.id, 'dispatched')}>
                      <ArrowRight size={14} /> Dispatch
                    </button>
                  )}
                  <button className="btn-secondary btn-sm" disabled={setAssignmentStatus.isPending} onClick={() => setConfirmComplete(activeAssignment.id)}>
                    <CheckCircle2 size={14} /> Mark completed
                  </button>
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
                            {i === 0 && <span className="badge-success text-xs">Best match</span>}
                            <span className="text-xs font-medium text-neutral-700">{rec.team_name}</span>
                            <span className="text-xs text-neutral-400">{rec.team_code}</span>
                          </div>
                          <span className="text-xs text-neutral-500">{rec.distance_km} km</span>
                        </div>
                        <p className="text-xs text-neutral-500">{rec.recommendation_reason}</p>
                        {rec.missing_equipment.length > 0 && <p className="text-xs font-medium text-red-600 mt-1">Missing equipment: {rec.missing_equipment.join(', ')}</p>}
                        {rec.capacity_gap > 0 && <p className="text-xs font-medium text-amber-700">Capacity shortfall: {rec.capacity_gap} people</p>}
                      </div>
                    ))}
                    <TeamEtaPanel incident={inc} teams={teams.data ?? []} recommendations={recommendations.data} />
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
              <h3 className="mb-2 font-display text-lg font-semibold">Reporter (Confidential)</h3>
              <div className="space-y-1 text-xs text-neutral-600">
                {inc.reporter_name && <p>Name: {inc.reporter_name}</p>}
                {inc.reporter_phone && <p>Phone: {inc.reporter_phone}</p>}
              </div>
            </div>
          )}

          <ConfidencePanel incident={inc} />

          {/* Verification controls */}
          <div className="card card-body">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <ShieldCheck size={14} /> Verification
            </h3>
            <div className="flex flex-wrap gap-2">
              <button className={`btn btn-sm ${inc.verification_status === 'verified' ? 'bg-green-100 text-green-700' : 'btn-secondary'}`} disabled={inc.verification_status === 'verified'} onClick={() => setVerifyChange('verified')}>
                <Check size={14} /> Verify
              </button>
              <button className={`btn btn-sm ${inc.verification_status === 'disputed' ? 'bg-red-100 text-red-700' : 'btn-secondary'}`} disabled={inc.verification_status === 'disputed'} onClick={() => setVerifyChange('disputed')}>
                <X size={14} /> Dispute
              </button>
              <button className={`btn btn-sm ${inc.verification_status === 'flagged' ? 'bg-yellow-100 text-yellow-700' : 'btn-secondary'}`} disabled={inc.verification_status === 'flagged'} onClick={() => setVerifyChange('flagged')}>
                <AlertTriangle size={14} /> Flag
              </button>
            </div>
          </div>

          {/* Full history: reports, status, verification, priority, facts, assignments */}
          <IncidentTimeline incidentId={inc.id} />
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
                      disabled={!rec.eligible}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all disabled:opacity-55 disabled:cursor-not-allowed ${selectedTeam === rec.team_id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
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
                      {rec.missing_equipment.length > 0 && <p className="text-xs text-red-600">Missing: {rec.missing_equipment.join(', ')}</p>}
                      {rec.capacity_gap > 0 && <p className="text-xs text-amber-700">Capacity shortfall: {rec.capacity_gap}</p>}
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

      <ReasonDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={(reason) => confirmCancel && void handleAssignmentStatus(confirmCancel, 'cancelled', reason)}
        title="Cancel assignment"
        message="The team and any reserved resources go back to the available pool. The incident returns to the queue."
        confirmLabel="Cancel assignment"
        danger
      />

      <ReasonDialog
        open={!!confirmComplete}
        onClose={() => setConfirmComplete(null)}
        onConfirm={(reason) => confirmComplete && void handleAssignmentStatus(confirmComplete, 'completed', reason)}
        title="Complete assignment"
        message="Marks the response as finished, resolves the incident, and makes the team and reserved resources available again."
        confirmLabel="Mark completed"
        required={false}
      />

      <ReasonDialog
        open={!!statusChange}
        onClose={() => setStatusChange(null)}
        onConfirm={(reason) => statusChange && void handleStatusChange(statusChange, reason)}
        title={`Change status to ${statusChange ? STATUS_LABELS[statusChange] : ''}`}
        message={activeAssignment && (statusChange === 'resolved' || statusChange === 'cancelled')
          ? `This also ${statusChange === 'resolved' ? 'completes' : 'cancels'} the active assignment and releases the team.`
          : 'Status changes are recorded in the timeline with your reason.'}
        confirmLabel="Change status"
        danger={statusChange === 'cancelled'}
      />

      <ReasonDialog
        open={!!verifyChange}
        onClose={() => setVerifyChange(null)}
        onConfirm={(reason) => verifyChange && void handleVerify(verifyChange, reason)}
        title={`Mark report ${verifyChange ? VERIFICATION_LABELS[verifyChange].toLowerCase() : ''}`}
        message="Say what you checked, e.g. a call-back to the reporter or a field team's confirmation."
        confirmLabel="Save"
      />

      <FactsModal open={factsModal} incident={inc} busy={updateIncident.isPending} onClose={() => setFactsModal(false)} onSave={handleUpdateFacts} />
      <PriorityOverrideModal open={priorityModal} incident={inc} busy={overridePriority.isPending} onClose={() => setPriorityModal(false)} onSave={handlePriorityOverride} />

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

function PriorityOverrideModal({ open, incident, busy, onClose, onSave }: { open: boolean; incident: Incident; busy: boolean; onClose: () => void; onSave: (level: PriorityLevel | null, reason: string) => void }) {
  const [level, setLevel] = useState<PriorityLevel | ''>(incident.priority_override_level ?? '');
  const [reason, setReason] = useState('');
  const close = () => { setLevel(incident.priority_override_level ?? ''); setReason(''); onClose(); };
  return <Modal open={open} onClose={close} title="Human priority decision" size="sm">
    <p className="mb-4 text-sm text-neutral-600">The calculated priority is {incident.calculated_priority_level ?? incident.priority_level} ({incident.calculated_priority_score ?? incident.priority_score}). An override controls the operational queue until it is cleared.</p>
    <label className="label">Operational priority</label>
    <select className="select" value={level} onChange={(event) => setLevel(event.target.value as PriorityLevel | '')}>
      <option value="">Use calculated priority (clear override)</option>
      <option value="critical">Critical</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option>
    </select>
    <label className="label mt-4">Reason for this decision</label>
    <textarea className="input resize-none" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Field team confirmed immediate danger" />
    <div className="mt-4 flex justify-end gap-3"><button className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={busy || reason.trim().length < 5} onClick={() => onSave(level || null, reason.trim())}>{busy ? <LoadingSpinner size={16} /> : 'Save decision'}</button></div>
  </Modal>;
}

const TRI_FIELDS = [
  ['people_trapped', 'People trapped'],
  ['injuries_reported', 'Injuries'],
  ['vulnerable_people', 'Vulnerable people'],
  ['danger_increasing', 'Danger increasing'],
] as const;

// Coordinator correction of reported facts. Priority is recalculated in the database and the change is logged.
function FactsModal({ open, incident, busy, onClose, onSave }: { open: boolean; incident: Incident; busy: boolean; onClose: () => void; onSave: (updates: Partial<Incident>, reason: string) => void }) {
  const initial = { type: incident.type, people_affected: incident.people_affected, people_trapped: incident.people_trapped, injuries_reported: incident.injuries_reported, vulnerable_people: incident.vulnerable_people, danger_increasing: incident.danger_increasing };
  const [facts, setFacts] = useState(initial);
  const [reason, setReason] = useState('');
  const changes = Object.fromEntries(Object.entries(facts).filter(([key, value]) => value !== initial[key as keyof typeof initial])) as Partial<Incident>;
  const close = () => { setFacts(initial); setReason(''); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Update reported facts" size="md">
      <p className="text-sm text-neutral-600 mb-4">Correct what is known about this incident. The priority score is recalculated from the new facts.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select className="select" value={facts.type} onChange={(e) => setFacts({ ...facts, type: e.target.value as IncidentType })}>
            {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">People affected</label>
          <input className="input" type="number" min={0} value={facts.people_affected} onChange={(e) => setFacts({ ...facts, people_affected: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        {TRI_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <select className="select" value={facts[key]} onChange={(e) => setFacts({ ...facts, [key]: e.target.value as TriState })}>
              <option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option>
            </select>
          </div>
        ))}
      </div>
      <label className="label mt-4">Reason / source of the new information</label>
      <textarea className="input resize-none" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reporter called back: water now waist high" />
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-secondary" onClick={close}>Cancel</button>
        <button className="btn-primary" disabled={busy || !reason.trim() || Object.keys(changes).length === 0} onClick={() => onSave(changes, reason.trim())}>
          {busy ? <LoadingSpinner size={16} /> : 'Save facts'}
        </button>
      </div>
    </Modal>
  );
}
