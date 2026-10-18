import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Radio, Edit, Siren } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DemoBadge, TeamStatusBadge } from '@/components/ui/Badges';
import { Modal, ReasonDialog } from '@/components/ui/Modal';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { LocationField } from '@/components/map/LocationField';
import { useTeams, useCreateTeam, useUpdateTeam, useSetTeamStatus, useAssignments, useIncidents } from '@/hooks/useData';
import { parseLocation, TEAM_STATUS_LABELS } from '@/types';
import type { RescueTeam, TeamStatus } from '@/types';
import { timeAgo } from '@/lib/utils';

const ALL_CAPABILITIES = ['water_rescue', 'boat', 'evacuation', 'medical', 'ambulance', 'fire_suppression', 'relief_distribution', 'general_rescue'];
const ALL_EQUIPMENT = ['rescue_boat', 'life_jackets', 'first_aid_kit', 'fire_engine', 'breathing_apparatus', 'extrication_tools', 'ambulance', 'trauma_kits', 'oxygen', 'supply_truck', 'water_tanks', 'blankets', 'rope_rescue', 'thermal_camera', 'inflatable_boat', 'life_rafts'];
const BOARD_ORDER: TeamStatus[] = ['available', 'assigned', 'en_route', 'unavailable', 'offline'];
const BOARD_HINT: Record<TeamStatus, string> = {
  available: 'Ready to dispatch',
  assigned: 'Assigned, not yet travelling',
  en_route: 'Travelling to an incident',
  unavailable: 'Temporarily cannot respond',
  offline: 'Off shift / unreachable',
};
// Busy and travelling follow the assignment workflow; only these can be set by hand.
const MANUAL_STATUSES: TeamStatus[] = ['available', 'unavailable', 'offline'];
const STALE_MS = 30 * 60_000;

export function TeamsPage() {
  const { toast } = useToast();
  const teams = useTeams();
  const assignments = useAssignments();
  const incidents = useIncidents({ limit: 1000 });
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const setTeamStatus = useSetTeamStatus();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusChange, setStatusChange] = useState<{ team: RescueTeam; status: TeamStatus } | null>(null);

  const activeByTeam = new Map((assignments.data ?? []).filter((a) => ['assigned', 'dispatched'].includes(a.status)).map((a) => [a.team_id, a]));
  const incidentById = new Map((incidents.data ?? []).map((i) => [i.id, i]));

  const changeStatus = async (team: RescueTeam, status: TeamStatus, reason?: string) => {
    try {
      await setTeamStatus.mutateAsync({ id: team.id, status, reason });
      toast(`${team.team_code} is now ${TEAM_STATUS_LABELS[status].toLowerCase()}`, 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to update status', 'error'); }
  };

  return (
    <DashboardLayout
      title="Team availability"
      subtitle="Who is free, busy, travelling or unavailable"
      actions={<button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={16} /> New team</button>}
    >
      {teams.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full" />)}</div>
      ) : teams.data?.length ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {BOARD_ORDER.map((status) => (
              <span key={status} className="card px-3 py-2 text-xs flex items-center gap-2"><TeamStatusBadge status={status} /> <strong>{teams.data!.filter((t) => t.status === status).length}</strong></span>
            ))}
          </div>
          {BOARD_ORDER.map((status) => {
            const group = teams.data!.filter((t) => t.status === status);
            if (!group.length) return null;
            return (
              <section key={status}>
                <h3 className="text-sm font-semibold text-neutral-700 mb-3">{TEAM_STATUS_LABELS[status]} <span className="text-neutral-400 font-normal">· {BOARD_HINT[status]}</span></h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map((team) => {
                    const active = activeByTeam.get(team.id);
                    const incident = active ? incidentById.get(active.incident_id) : undefined;
                    const lastSeen = team.last_location_update ? new Date(team.last_location_update).getTime() : null;
                    const stale = lastSeen !== null && Date.now() - lastSeen > STALE_MS;
                    return (
                      <div key={team.id} className="card card-body">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center"><Users size={20} className="text-primary-600" /></div>
                            <div>
                              <p className="text-sm font-semibold text-neutral-800">{team.name}</p>
                              <code className="text-xs text-neutral-400">{team.team_code}</code>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1"><TeamStatusBadge status={team.status} />{team.is_demo && <DemoBadge />}</div>
                        </div>

                        {incident && (
                          <Link to={`/incidents/${incident.id}`} className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 hover:bg-amber-100">
                            <Siren size={13} className="text-amber-700" /> <span><strong>{incident.report_code}</strong>{incident.area_landmark ? ` · ${incident.area_landmark}` : ''}</span>
                          </Link>
                        )}

                        <div className="space-y-2 text-xs">
                          <div>
                            <p className="text-neutral-400 mb-1">Trained for</p>
                            <div className="flex flex-wrap gap-1">{team.capabilities.length ? team.capabilities.map((cap) => <span key={cap} className="badge-info text-xs">{cap.replace(/_/g, ' ')}</span>) : <span className="text-neutral-400">—</span>}</div>
                          </div>
                          <div>
                            <p className="text-neutral-400 mb-1">Equipment</p>
                            <div className="flex flex-wrap gap-1">{team.equipment.length ? team.equipment.map((eq) => <span key={eq} className="badge-neutral text-xs">{eq.replace(/_/g, ' ')}</span>) : <span className="text-neutral-400">—</span>}</div>
                          </div>
                          <div className="flex items-center gap-2 text-neutral-500"><Users size={12} /> {team.capacity} personnel</div>
                          <div className={`flex items-center gap-2 ${stale ? 'text-amber-700' : 'text-neutral-400'}`}>
                            <Radio size={12} /> Position {lastSeen ? `reported ${timeAgo(team.last_location_update!)}${stale ? ' — outdated' : ''}` : 'never reported'}
                          </div>
                          <div className="text-neutral-400">Status changed {timeAgo(team.updated_at)}</div>
                        </div>

                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                          <select
                            className="select btn-sm flex-1"
                            value={team.status}
                            disabled={setTeamStatus.isPending}
                            onChange={(e) => {
                              const next = e.target.value as TeamStatus;
                              if (next === 'available') void changeStatus(team, next);
                              else setStatusChange({ team, status: next });
                            }}
                          >
                            {!MANUAL_STATUSES.includes(team.status) && <option value={team.status}>{TEAM_STATUS_LABELS[team.status]} (from assignment)</option>}
                            {MANUAL_STATUSES.map((s) => (
                              <option key={s} value={s} disabled={s === 'available' && !!team.current_assignment_id}>{TEAM_STATUS_LABELS[s]}{s === 'available' && team.current_assignment_id ? ' — finish assignment first' : ''}</option>
                            ))}
                          </select>
                          <button className="btn-ghost btn-sm" title="Edit team" onClick={() => setEditingId(team.id)}><Edit size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No teams yet" message="Create a rescue team to get started." />
      )}

      <ReasonDialog
        open={!!statusChange}
        onClose={() => setStatusChange(null)}
        onConfirm={(reason) => statusChange && void changeStatus(statusChange.team, statusChange.status, reason)}
        title={`Mark ${statusChange?.team.team_code ?? ''} ${statusChange ? TEAM_STATUS_LABELS[statusChange.status].toLowerCase() : ''}`}
        message={statusChange?.team.current_assignment_id
          ? 'This team has an active assignment. Coordinators will get a critical alert to reassign the incident.'
          : 'The team will not be recommended for new incidents until it is available again.'}
        confirmLabel="Update status"
        danger
      />

      {showCreate && (
        <TeamFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            try {
              await createTeam.mutateAsync(data);
              toast('Team created', 'success');
              setShowCreate(false);
            } catch (err) { toast(err instanceof Error ? err.message : 'Failed to create team', 'error'); }
          }}
        />
      )}

      {editingId && (
        <TeamFormModal
          team={teams.data?.find((t) => t.id === editingId)}
          onClose={() => setEditingId(null)}
          onSubmit={async (data) => {
            try {
              await updateTeam.mutateAsync({ id: editingId, updates: data });
              toast('Team updated', 'success');
              setEditingId(null);
            } catch (err) { toast(err instanceof Error ? err.message : 'Failed to update team', 'error'); }
          }}
        />
      )}
    </DashboardLayout>
  );
}

function TeamFormModal({
  team,
  onSubmit,
  onClose,
}: {
  team?: { name: string; capabilities: string[]; equipment: string[]; capacity: number; location: string | null };
  onSubmit: (data: { name: string; capabilities: string[]; equipment: string[]; capacity: number; latitude: number; longitude: number }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(team?.name ?? '');
  const [caps, setCaps] = useState<string[]>(team?.capabilities ?? []);
  const [equip, setEquip] = useState<string[]>(team?.equipment ?? []);
  const [capacity, setCapacity] = useState(team?.capacity ?? 4);
  const [pos, setPos] = useState<[number, number] | null>(team?.location ? parseLocation(team.location) : null);

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  return (
    <Modal open onClose={onClose} title={team ? 'Edit team' : 'New rescue team'} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Team name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverine Rescue Alpha" />
          </div>
          <div>
            <label className="label">Personnel</label>
            <input type="number" min={0} className="input" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Trained for</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {ALL_CAPABILITIES.map((cap) => (
                <button key={cap} type="button" className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${caps.includes(cap) ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-400'}`} onClick={() => toggle(caps, cap, setCaps)}>
                  {cap.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Equipment</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {ALL_EQUIPMENT.map((eq) => (
                <button key={eq} type="button" className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${equip.includes(eq) ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-400'}`} onClick={() => toggle(equip, eq, setEquip)}>
                  {eq.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <LocationField label="Base / current position" value={pos} onChange={setPos} />
        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || !pos} onClick={() => pos && onSubmit({ name: name.trim(), capabilities: caps, equipment: equip, capacity, latitude: pos[0], longitude: pos[1] })}>
            {team ? 'Save changes' : 'Create team'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
