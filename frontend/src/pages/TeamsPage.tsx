import { useState } from 'react';
import { Plus, Users, MapPin, Radio, Edit } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { TeamStatusBadge } from '@/components/ui/Badges';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useTeams, useCreateTeam, useUpdateTeam } from '@/hooks/useData';
import { parseLocation } from '@/types';
import type { TeamStatus } from '@/types';
import { timeAgo } from '@/lib/utils';

const ALL_CAPABILITIES = ['water_rescue', 'boat', 'evacuation', 'medical', 'ambulance', 'fire_suppression', 'relief_distribution', 'general_rescue'];
const ALL_EQUIPMENT = ['rescue_boat', 'life_jackets', 'first_aid_kit', 'fire_engine', 'breathing_apparatus', 'extrication_tools', 'ambulance', 'trauma_kits', 'oxygen', 'supply_truck', 'water_tanks', 'blankets', 'rope_rescue', 'thermal_camera', 'inflatable_boat', 'life_rafts'];

export function TeamsPage() {
  const { toast } = useToast();
  const teams = useTeams();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <DashboardLayout
      title="Rescue Teams"
      subtitle="Manage team capabilities, equipment, and availability"
      actions={
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Team
        </button>
      }
    >
      {teams.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : teams.data && teams.data.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.data.map((team) => {
            const pos = parseLocation(team.location);
            return (
              <div key={team.id} className="card card-body">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                      <Users size={20} className="text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{team.name}</p>
                      <code className="text-[10px] text-neutral-400">{team.team_code}</code>
                    </div>
                  </div>
                  <TeamStatusBadge status={team.status} />
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <p className="text-neutral-400 mb-1">Capabilities</p>
                    <div className="flex flex-wrap gap-1">
                      {team.capabilities.map((cap) => (
                        <span key={cap} className="badge-info text-[10px]">{cap.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-neutral-400 mb-1">Equipment</p>
                    <div className="flex flex-wrap gap-1">
                      {team.equipment.map((eq) => (
                        <span key={eq} className="badge-neutral text-[10px]">{eq.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-neutral-500">
                    <Users size={12} /> Capacity: {team.capacity}
                  </div>
                  {pos && (
                    <div className="flex items-center gap-2 text-neutral-500">
                      <MapPin size={12} /> {pos[0].toFixed(3)}, {pos[1].toFixed(3)}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Radio size={12} /> Last update: {team.last_location_update ? timeAgo(team.last_location_update) : '—'}
                  </div>
                </div>

                {/* Quick status toggle */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  <select
                    className="select btn-sm flex-1"
                    value={team.status}
                    onChange={async (e) => {
                      try {
                        await updateTeam.mutateAsync({ id: team.id, updates: { status: e.target.value as TeamStatus } });
                        toast('Team status updated', 'success');
                      } catch { toast('Failed to update status', 'error'); }
                    }}
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="offline">Offline</option>
                  </select>
                  <button className="btn-ghost btn-sm" onClick={() => setEditingId(team.id)}>
                    <Edit size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No teams" message="Create a rescue team to get started." />
      )}

      {showCreate && (
        <TeamFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            try {
              await createTeam.mutateAsync(data);
              toast('Team created', 'success');
              setShowCreate(false);
            } catch { toast('Failed to create team', 'error'); }
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
            } catch { toast('Failed to update team', 'error'); }
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
  const pos = team?.location ? parseLocation(team.location) : null;
  const [name, setName] = useState(team?.name ?? '');
  const [caps, setCaps] = useState<string[]>(team?.capabilities ?? []);
  const [equip, setEquip] = useState<string[]>(team?.equipment ?? []);
  const [capacity, setCapacity] = useState(team?.capacity ?? 4);
  const [lat, setLat] = useState(pos?.[0] ?? 28.61);
  const [lng, setLng] = useState(pos?.[1] ?? 77.2);

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  return (
    <Modal open onClose={onClose} title={team ? 'Edit Team' : 'New Rescue Team'} size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Team Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Riverine Rescue Alpha" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Capabilities</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {ALL_CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${caps.includes(cap) ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-400'}`}
                  onClick={() => toggle(caps, cap, setCaps)}
                >
                  {cap.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Equipment</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {ALL_EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${equip.includes(eq) ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-400'}`}
                  onClick={() => toggle(equip, eq, setEquip)}
                >
                  {eq.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Capacity</label>
            <input type="number" min={0} className="input" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Latitude</label>
            <input type="number" step="0.0001" className="input" value={lat} onChange={(e) => setLat(parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input type="number" step="0.0001" className="input" value={lng} onChange={(e) => setLng(parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name} onClick={() => onSubmit({ name, capabilities: caps, equipment: equip, capacity, latitude: lat, longitude: lng })}>
            {team ? 'Save Changes' : 'Create Team'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
