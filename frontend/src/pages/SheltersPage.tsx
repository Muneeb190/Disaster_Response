import { useState } from 'react';
import { Plus, House, Edit, Minus, MapPin } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { DemoBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState, LoadingSpinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { LocationField } from '@/components/map/LocationField';
import { useShelters, useSaveShelter, useAdjustShelterOccupancy } from '@/hooks/useData';
import { parseLocation, type Shelter, type ShelterStatus } from '@/types';
import { timeAgo } from '@/lib/utils';

const STALE_MS = 6 * 3_600_000;
const FACILITIES = [
  ['wheelchair_access', 'Wheelchair access'],
  ['medical_support', 'Medical support'],
  ['family_area', 'Women / family area'],
  ['has_power', 'Power'],
] as const;
type FacilityKey = (typeof FACILITIES)[number][0];
const STATUS_STYLE: Record<ShelterStatus, string> = { open: 'badge-success', full: 'badge-error', closed: 'badge-neutral' };

export function SheltersPage() {
  const { toast } = useToast();
  const shelters = useShelters();
  const adjust = useAdjustShelterOccupancy();
  const [editing, setEditing] = useState<Shelter | 'new' | null>(null);
  const [needs, setNeeds] = useState<FacilityKey[]>([]);

  const list = (shelters.data ?? []).filter((s) => needs.every((need) => s[need] === true));
  const open = (shelters.data ?? []).filter((s) => s.status !== 'closed');
  const capacity = open.reduce((sum, s) => sum + s.capacity, 0);
  const occupancy = open.reduce((sum, s) => sum + s.occupancy, 0);

  const change = async (shelter: Shelter, delta: number) => {
    try {
      await adjust.mutateAsync({ id: shelter.id, delta, reason: delta > 0 ? 'Arrivals recorded' : 'Departures recorded' });
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to update occupancy', 'error'); }
  };

  return (
    <DashboardLayout
      title="Shelters"
      subtitle="Capacity, facilities and how fresh the information is"
      actions={<button className="btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={16} /> New shelter</button>}
    >
      <div className="card card-body mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span><strong>{open.length}</strong> open</span>
        <span><strong>{Math.max(0, capacity - occupancy)}</strong> of {capacity} spaces free</span>
        <span className="text-neutral-400">|</span>
        <span className="text-xs text-neutral-500">Show only:</span>
        {FACILITIES.map(([key, label]) => (
          <label key={key} className="text-xs text-neutral-600 flex items-center gap-1.5">
            <input type="checkbox" checked={needs.includes(key)} onChange={(e) => setNeeds((current) => (e.target.checked ? [...current, key] : current.filter((n) => n !== key)))} /> {label}
          </label>
        ))}
      </div>

      {shelters.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
      ) : list.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((shelter) => {
            const used = shelter.capacity ? Math.round((shelter.occupancy / shelter.capacity) * 100) : 100;
            const stale = Date.now() - new Date(shelter.last_updated_at).getTime() > STALE_MS;
            const pos = parseLocation(shelter.location);
            return (
              <div key={shelter.id} className="card card-body">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><House size={20} className="text-teal-700" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-800 truncate">{shelter.name}</p>
                      <p className="text-[11px] text-neutral-400 truncate">{shelter.address || (pos ? `${pos[0].toFixed(3)}, ${pos[1].toFixed(3)}` : 'No location')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1"><span className={STATUS_STYLE[shelter.status]}>{shelter.status}</span>{shelter.is_demo && <DemoBadge />}</div>
                </div>

                <div className="flex justify-between text-xs mb-1"><span>{shelter.occupancy} / {shelter.capacity} occupied</span><strong>{used}%</strong></div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full ${used >= 90 ? 'bg-red-500' : used >= 70 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${Math.min(100, used)}%` }} /></div>

                <div className="flex flex-wrap gap-1 mt-3">
                  {FACILITIES.map(([key, label]) => (
                    <span key={key} className={shelter[key] === true ? 'badge-success text-[10px]' : shelter[key] === false ? 'badge-neutral text-[10px] line-through' : 'badge-neutral text-[10px] opacity-60'} title={shelter[key] === null ? 'Not confirmed' : undefined}>
                      {label}{shelter[key] === null ? ' ?' : ''}
                    </span>
                  ))}
                </div>
                {shelter.notes && <p className="text-xs text-neutral-500 mt-2">{shelter.notes}</p>}
                <p className={`text-xs mt-2 ${stale ? 'text-amber-700' : 'text-neutral-400'}`}>Updated {timeAgo(shelter.last_updated_at)}{stale && ' — may be out of date'}</p>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  <button className="btn-secondary btn-sm" disabled={adjust.isPending || shelter.occupancy === 0} onClick={() => void change(shelter, -1)} title="One person left"><Minus size={14} /></button>
                  <button className="btn-secondary btn-sm" disabled={adjust.isPending || shelter.status !== 'open'} onClick={() => void change(shelter, 1)} title="One person arrived"><Plus size={14} /></button>
                  <button className="btn-secondary btn-sm" disabled={adjust.isPending || shelter.capacity - shelter.occupancy < 10 || shelter.status !== 'open'} onClick={() => void change(shelter, 10)}>+10</button>
                  <button className="btn-ghost btn-sm ml-auto" title="Edit shelter" onClick={() => setEditing(shelter)}><Edit size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<MapPin size={38} />} title={shelters.data?.length ? 'No shelter matches' : 'No shelters yet'} message={shelters.data?.length ? 'No shelter has all the selected facilities confirmed.' : 'Add shelters with their capacity and facilities.'} />
      )}

      {editing && <ShelterFormModal shelter={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </DashboardLayout>
  );
}

type Tri = 'yes' | 'no' | 'unknown';
const toTri = (value: boolean | null | undefined): Tri => (value === true ? 'yes' : value === false ? 'no' : 'unknown');
const fromTri = (value: Tri) => (value === 'yes' ? true : value === 'no' ? false : null);

function ShelterFormModal({ shelter, onClose }: { shelter?: Shelter; onClose: () => void }) {
  const { toast } = useToast();
  const save = useSaveShelter();
  const [name, setName] = useState(shelter?.name ?? '');
  const [address, setAddress] = useState(shelter?.address ?? '');
  const [capacity, setCapacity] = useState(shelter?.capacity ?? 100);
  const [closed, setClosed] = useState(shelter?.status === 'closed');
  const [notes, setNotes] = useState(shelter?.notes ?? '');
  const [pos, setPos] = useState<[number, number] | null>(shelter?.location ? parseLocation(shelter.location) : null);
  const [facilities, setFacilities] = useState<Record<FacilityKey, Tri>>(
    Object.fromEntries(FACILITIES.map(([key]) => [key, toTri(shelter?.[key])])) as Record<FacilityKey, Tri>,
  );
  const tooSmall = !!shelter && capacity < shelter.occupancy;

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: shelter?.id,
        input: {
          name: name.trim(),
          address: address.trim() || null,
          capacity,
          // open/full is derived from occupancy in the database; only "closed" is set by hand.
          status: closed ? 'closed' : 'open',
          notes: notes.trim() || null,
          ...Object.fromEntries(FACILITIES.map(([key]) => [key, fromTri(facilities[key])])),
          latitude: pos?.[0],
          longitude: pos?.[1],
        },
      });
      toast(shelter ? 'Shelter updated' : 'Shelter created', 'success');
      onClose();
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to save shelter', 'error'); }
  };

  return (
    <Modal open onClose={onClose} title={shelter ? 'Edit shelter' : 'New shelter'} size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Government Boys School Hall" /></div>
          <div><label className="label">Capacity (people)</label><input className="input" type="number" min={0} value={capacity} onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value) || 0))} /></div>
        </div>
        {tooSmall && <p className="text-xs text-red-600">Capacity can’t be below current occupancy ({shelter!.occupancy}).</p>}
        <div><label className="label">Address / landmark</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div>
          <label className="label">Facilities <span className="text-neutral-400 font-normal">(leave “unknown” unless confirmed)</span></label>
          <div className="grid sm:grid-cols-2 gap-2">
            {FACILITIES.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2 text-sm">
                <span>{label}</span>
                <select className="select w-auto btn-sm" value={facilities[key]} onChange={(e) => setFacilities({ ...facilities, [key]: e.target.value as Tri })}>
                  <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Shelter is closed (not accepting people)</label>
        <div><label className="label">Notes</label><textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <LocationField label="Shelter location" value={pos} onChange={setPos} />
        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending || !name.trim() || !pos || tooSmall} onClick={() => void submit()}>
            {save.isPending ? <LoadingSpinner size={16} /> : shelter ? 'Save changes' : 'Create shelter'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
