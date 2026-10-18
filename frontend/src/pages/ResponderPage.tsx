import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, CircleDot, Crosshair, LifeBuoy,
  LocateFixed, LogOut, MapPin, Navigation, PackageCheck, Radio, ShieldAlert,
  Siren, Users, XCircle,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import {
  type ResponderLocation,
  useAssignments,
  useIncidents,
  useResources,
  useResponderAssignmentAction,
  useResponderCompleteAssignment,
  useResponderRejectAssignment,
  useTeams,
} from '@/hooks/useData';
import { AssignmentStatusBadge, PriorityBadge, TriStateBadge } from '@/components/ui/Badges';
import { EmptyState, LoadingSpinner } from '@/components/ui/States';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import {
  ASSIGNMENT_FIELD_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  parseLocation,
  type Assignment,
  type Incident,
  type Resource,
} from '@/types';
import { useToast } from '@/components/ui/toast-context';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { cacheAssignments, cachedAssignments, queueOffline } from '@/lib/offlineSync';

const REQUIRED_EQUIPMENT: Record<Incident['type'], string[]> = {
  flood: ['Boat or high-clearance vehicle', 'Life jackets', 'Rescue rope', 'First-aid kit'],
  fire: ['Fire suppression equipment', 'Breathing protection', 'First-aid kit'],
  medical_emergency: ['Medical kit', 'Patient transport equipment', 'Protective equipment'],
  heatwave: ['Water', 'Cooling supplies', 'Medical kit', 'Patient transport'],
  other: ['First-aid kit', 'Rescue tools', 'Protective equipment'],
};

function browserLocation(): Promise<ResponderLocation | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    );
  });
}

export function ResponderPage() {
  const auth = useAuth();
  const assignments = useAssignments();
  const incidents = useIncidents({ includeLinked: true });
  const teams = useTeams();
  const resources = useResources();
  const action = useResponderAssignmentAction();
  const reject = useResponderRejectAssignment();
  const complete = useResponderCompleteAssignment();
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [rejecting, setRejecting] = useState<Assignment | null>(null);
  const [backupFor, setBackupFor] = useState<Assignment | null>(null);
  const [completionFor, setCompletionFor] = useState<Assignment | null>(null);
  const [offlineData,setOfflineData]=useState<{assignments:Assignment[];incidents:Incident[];teams:ReturnType<typeof useTeams>['data'];resources:Resource[]}|null>(null);

  const incidentRows=incidents.data??offlineData?.incidents??[];const teamRows=teams.data??offlineData?.teams??[];const resourceRows=resources.data??offlineData?.resources??[];
  const incidentById = new Map(incidentRows.map((incident) => [incident.id, incident]));
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const resourceById = new Map(resourceRows.map((resource) => [resource.id, resource]));
  const busy = action.isPending || reject.isPending || complete.isPending || locating;
  useEffect(()=>{if(assignments.data&&incidents.data&&teams.data&&resources.data)void cacheAssignments({assignments:assignments.data,incidents:incidents.data,teams:teams.data,resources:resources.data});if(!navigator.onLine)void cachedAssignments<typeof offlineData>().then(rows=>setOfflineData(rows??null))},[assignments.data,incidents.data,teams.data,resources.data]);
  const assignmentRows=assignments.data??offlineData?.assignments??[];

  const withLocation = async () => {
    setLocating(true);
    const location = await browserLocation();
    setLocating(false);
    if (!location) toast('Location permission was unavailable. The urgent action will still be sent.', 'warning');
    return location;
  };

  const sendAction = async (assignment: Assignment, fieldAction: 'accept' | 'arrived' | 'victim_reached', success: string) => {
    try {
      const location = await withLocation();
      if (!navigator.onLine) {
        await queueOffline('responder_action', { p_assignment_id: assignment.id, p_action: fieldAction, p_reason: null, p_latitude: location?.latitude ?? null, p_longitude: location?.longitude ?? null, p_accuracy_m: location?.accuracy ?? null });
        toast(`${success} queued and will sync once, in order, when connected`, 'success');
        return;
      }
      await action.mutateAsync({ assignmentId: assignment.id, action: fieldAction, location });
      toast(location ? `${success} — current location attached` : success, 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Unable to update assignment', 'error'); }
  };

  const rejectAssignment = async (reason: string) => {
    if (!rejecting) return;
    try {
      await reject.mutateAsync({ assignmentId: rejecting.id, reason });
      setRejecting(null);
      toast('Assignment rejected with reason; coordinator alerted', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Unable to reject assignment', 'error'); }
  };

  const requestBackup = async (reason: string) => {
    if (!backupFor) return;
    try {
      const location = await withLocation();
      if (!navigator.onLine) {
        await queueOffline('responder_action', { p_assignment_id: backupFor.id, p_action: 'needs_backup', p_reason: reason, p_latitude: location?.latitude ?? null, p_longitude: location?.longitude ?? null, p_accuracy_m: location?.accuracy ?? null });
        setBackupFor(null); toast('Backup request queued for ordered synchronization', 'success'); return;
      }
      await action.mutateAsync({ assignmentId: backupFor.id, action: 'needs_backup', reason, location });
      setBackupFor(null);
      toast('Critical backup request sent to the command centre', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Unable to request backup', 'error'); }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-[#102e2b] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 font-bold"><Radio size={20} /> ResQNet Responder Web</div>
          <button className="flex items-center gap-2 text-sm text-slate-200" onClick={() => void auth.signOut()}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link to="/portal" className="mb-5 flex items-center gap-1 text-sm text-neutral-500"><ArrowLeft size={15} /> Workspaces</Link>
        <div>
          <p className="text-xs font-semibold text-primary-600">Responder website</p>
          <h1 className="mt-1 text-2xl font-bold">My team assignments</h1>
          <p className="mt-1 text-sm text-neutral-500">Signed in as {auth.profile?.full_name}. Status taps request your browser location; continuous tracking is not used.</p>
        </div>

        <div className="mt-6 space-y-4">
          {((assignments.isLoading || incidents.isLoading || teams.isLoading || resources.isLoading) && navigator.onLine) ? (
            <div className="card card-body grid place-items-center"><LoadingSpinner /></div>
          ) : (assignments.error || incidents.error) && !offlineData ? (
            <div className="card card-body text-sm text-red-700">Assignments could not be loaded. Refresh the page or check your team membership.</div>
          ) : assignmentRows.length ? assignmentRows.map((assignment) => {
            const incident = incidentById.get(assignment.incident_id);
            const team = teamById.get(assignment.team_id);
            if (!incident) return null;
            const position = parseLocation(incident.location);
            const reserved = assignment.resource_ids.map((id) => resourceById.get(id)).filter(Boolean) as Resource[];
            const isActive = assignment.status === 'assigned' || assignment.status === 'dispatched';
            return (
              <article key={assignment.id} className={`card card-body ${isActive && incident.priority_level === 'critical' ? 'border-red-300' : ''}`}>
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-neutral-400">{team?.team_code} · {team?.name}</p>
                    <h2 className="mt-1 text-lg font-bold">{INCIDENT_TYPE_LABELS[incident.type]}</h2>
                    <p className="mt-1 text-sm text-neutral-700">{incident.description}</p>
                    {incident.area_landmark && <p className="mt-3 flex items-center gap-1 text-sm"><MapPin size={14} /> {incident.area_landmark}</p>}
                  </div>
                  <div className="flex items-start gap-2"><PriorityBadge level={incident.priority_level} /><AssignmentStatusBadge status={assignment.status} /></div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-red-800"><ShieldAlert size={14} /> Risks and vulnerable people</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <TriStateBadge value={incident.people_trapped} label="Trapped" />
                      <TriStateBadge value={incident.injuries_reported} label="Injuries" />
                      <TriStateBadge value={incident.vulnerable_people} label="Vulnerable" />
                      <TriStateBadge value={incident.danger_increasing} label="Worsening" />
                    </div>
                    {incident.priority_reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-900">{incident.priority_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-blue-800"><PackageCheck size={14} /> Equipment</h3>
                    <p className="mt-2 text-xs font-medium text-blue-900">Required for this incident</p>
                    <p className="mt-1 text-xs text-blue-900">{REQUIRED_EQUIPMENT[incident.type].join(' · ')}</p>
                    <p className="mt-2 text-xs font-medium text-blue-900">Team equipment</p>
                    <p className="mt-1 text-xs text-blue-900">{team?.equipment.length ? team.equipment.join(' · ') : 'No team equipment recorded'}</p>
                    <p className="mt-2 text-xs font-medium text-blue-900">Reserved supplies</p>
                    <p className="mt-1 text-xs text-blue-900">{reserved.length ? reserved.map((item) => item.name).join(' · ') : 'None reserved'}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
                  <CircleDot size={14} />
                  <strong>{ASSIGNMENT_FIELD_STATUS_LABELS[assignment.field_status ?? (assignment.status === 'assigned' ? 'awaiting_response' : 'en_route')]}</strong>
                  {assignment.last_field_update_at && <span>· updated {timeAgo(assignment.last_field_update_at)}</span>}
                  {assignment.last_field_location_accuracy_m != null && <span>· GPS accuracy ±{Math.round(assignment.last_field_location_accuracy_m)} m</span>}
                  {position && <a className="ml-auto inline-flex items-center gap-1 text-primary-700 underline" href={`https://www.google.com/maps/dir/?api=1&destination=${position[0]},${position[1]}`} target="_blank" rel="noreferrer"><Navigation size={13} /> Open directions</a>}
                </div>

                {isActive && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                    {assignment.status === 'assigned' && <>
                      <button className="btn-primary" disabled={busy} onClick={() => void sendAction(assignment, 'accept', 'Assignment accepted; team en route')}><Siren size={16} /> Accept &amp; go en route</button>
                      <button className="btn-secondary text-red-700" disabled={busy} onClick={() => setRejecting(assignment)}><XCircle size={16} /> Reject</button>
                    </>}
                    {assignment.status === 'dispatched' && <>
                      {(assignment.field_status === 'en_route' || !assignment.field_status) && <button className="btn-primary" disabled={busy} onClick={() => void sendAction(assignment, 'arrived', 'Arrival recorded')}><LocateFixed size={16} /> Arrived</button>}
                      {assignment.field_status === 'arrived' && <button className="btn-primary" disabled={busy} onClick={() => void sendAction(assignment, 'victim_reached', 'Victim reached recorded')}><Users size={16} /> Victim reached</button>}
                      {['arrived', 'victim_reached'].includes(assignment.field_status) && <button className="btn-primary" disabled={busy} onClick={() => setCompletionFor(assignment)}><CheckCircle2 size={16} /> Complete response</button>}
                      <button className="btn-danger" disabled={busy} onClick={() => setBackupFor(assignment)}><LifeBuoy size={16} /> Needs backup</button>
                    </>}
                    {locating && <span className="flex items-center gap-2 text-xs text-neutral-500"><Crosshair size={14} className="animate-pulse" /> Getting browser location…</span>}
                  </div>
                )}
                {!isActive && (
                  <p className="mt-4 border-t pt-3 text-xs text-neutral-500">
                    Closed {assignment.completed_at || assignment.rejected_at || assignment.cancelled_at ? formatDateTime(assignment.completed_at || assignment.rejected_at || assignment.cancelled_at!) : ''}
                    {assignment.rejection_reason && ` · Rejection reason: ${assignment.rejection_reason}`}
                  </p>
                )}
              </article>
            );
          }) : <div className="card"><EmptyState title="No assignments" message="Your team has no active or historical assignments." /></div>}
        </div>
      </main>

      <ReasonDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => void rejectAssignment(reason)}
        title="Reject assignment"
        message="Explain why your team cannot take this job. The incident returns to the queue and the coordinator receives an alert."
        confirmLabel="Reject and alert coordinator"
        danger
      />
      <ReasonDialog
        open={!!backupFor}
        onClose={() => setBackupFor(null)}
        onConfirm={(reason) => void requestBackup(reason)}
        title="Request backup"
        message="Describe the immediate need, such as another boat, medical support, or additional personnel. This creates a critical command-centre alert."
        confirmLabel="Send critical backup request"
        danger
      />
      <CompletionModal
        assignment={completionFor}
        incident={completionFor ? incidentById.get(completionFor.incident_id) ?? null : null}
        resources={completionFor ? completionFor.resource_ids.map((id) => resourceById.get(id)).filter(Boolean) as Resource[] : []}
        busy={busy}
        onClose={() => setCompletionFor(null)}
        onSubmit={async (values) => {
          if (!completionFor) return;
          try {
            const location = await withLocation();
            await complete.mutateAsync({ assignmentId: completionFor.id, ...values, location });
            setCompletionFor(null);
            toast(values.furtherHelpNeeded ? 'Completion recorded; coordinator alerted that more help is needed' : 'Response completed and incident resolved', 'success');
          } catch (error) { toast(error instanceof Error ? error.message : 'Could not submit completion report', 'error'); }
        }}
      />
    </div>
  );
}

function CompletionModal({
  assignment,
  incident,
  resources,
  busy,
  onClose,
  onSubmit,
}: {
  assignment: Assignment | null;
  incident: Incident | null;
  resources: Resource[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: {
    peopleReached: number;
    suppliesUsed: { resource_id: string; quantity: number }[];
    furtherHelpNeeded: boolean;
    furtherHelpDetails: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [peopleReached, setPeopleReached] = useState(0);
  const [used, setUsed] = useState<string[]>([]);
  const [furtherHelpNeeded, setFurtherHelpNeeded] = useState(false);
  const [furtherHelpDetails, setFurtherHelpDetails] = useState('');
  const [notes, setNotes] = useState('');

  const close = () => {
    setPeopleReached(0); setUsed([]); setFurtherHelpNeeded(false); setFurtherHelpDetails(''); setNotes(''); onClose();
  };
  const valid = peopleReached >= 0 && (!furtherHelpNeeded || furtherHelpDetails.trim().length >= 5);
  return (
    <Modal open={!!assignment} onClose={close} title="Rescue completion report" size="md">
      <p className="mb-4 text-sm text-neutral-600">Record the outcome before closing this assignment. Used reserved supplies are removed from inventory; unused items return to stock.</p>
      <label className="label">People reached</label>
      <input className="input" type="number" min={0} value={peopleReached} onChange={(event) => setPeopleReached(Math.max(0, Number(event.target.value) || 0))} placeholder={String(incident?.people_affected ?? 0)} />
      <div className="mt-4">
        <label className="label">Reserved supplies used</label>
        {resources.length ? <div className="space-y-2 rounded-lg border border-neutral-200 p-3">{resources.map((resource) => (
          <label key={resource.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={used.includes(resource.id)} onChange={(event) => setUsed((current) => event.target.checked ? [...current, resource.id] : current.filter((id) => id !== resource.id))} />
            {resource.name} <span className="text-xs text-neutral-400">(1 reserved unit)</span>
          </label>
        ))}</div> : <p className="text-xs text-neutral-500">No inventory was reserved with this assignment.</p>}
      </div>
      <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <input type="checkbox" className="mt-0.5" checked={furtherHelpNeeded} onChange={(event) => setFurtherHelpNeeded(event.target.checked)} />
        Further help is still needed after this response
      </label>
      {furtherHelpNeeded && <div className="mt-3"><label className="label">What further help is needed?</label><textarea className="input resize-none" rows={2} value={furtherHelpDetails} onChange={(event) => setFurtherHelpDetails(event.target.value)} placeholder="Required—this will create a critical coordinator alert" /></div>}
      <div className="mt-3"><label className="label">Outcome notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea className="input resize-none" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition found, people assisted, handover details…" /></div>
      <div className="mt-5 flex justify-end gap-3 border-t pt-4">
        <button className="btn-secondary" onClick={close}>Cancel</button>
        <button className="btn-primary" disabled={!valid || busy} onClick={() => void onSubmit({ peopleReached, suppliesUsed: used.map((resource_id) => ({ resource_id, quantity: 1 })), furtherHelpNeeded, furtherHelpDetails: furtherHelpDetails.trim(), notes: notes.trim() })}>
          {busy ? <LoadingSpinner size={16} /> : <CheckCircle2 size={16} />} Submit and complete
        </button>
      </div>
    </Modal>
  );
}
