import { useState } from 'react';
import { Plus, Package, MapPin, TrendingDown, Edit } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useResources, useCreateResource, useUpdateResource } from '@/hooks/useData';
import { parseLocation } from '@/types';
import { timeAgo } from '@/lib/utils';

const RESOURCE_TYPES = ['boat', 'ambulance', 'medical_kit', 'drinking_water', 'food', 'shelter', 'blanket', 'fuel', 'communication'];

export function ResourcesPage() {
  const { toast } = useToast();
  const resources = useResources();
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <DashboardLayout
      title="Resources & Shelters"
      subtitle="Track inventory, reservations, and stock levels"
      actions={
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Resource
        </button>
      }
    >
      {resources.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : resources.data && resources.data.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.data.map((res) => {
            const pos = parseLocation(res.location);
            const isLow = res.quantity_available <= res.low_stock_threshold;
            const total = res.quantity_available + res.quantity_reserved;
            const occupancyPct = total > 0 ? (res.quantity_reserved / total) * 100 : 0;

            return (
              <div key={res.id} className={`card card-body ${isLow ? 'border-l-4 border-l-orange-400' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLow ? 'bg-orange-50' : 'bg-blue-50'}`}>
                      <Package size={20} className={isLow ? 'text-orange-600' : 'text-primary-600'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{res.name}</p>
                      <span className="text-[10px] text-neutral-400 capitalize">{res.type}</span>
                    </div>
                  </div>
                  {isLow && (
                    <span className="badge-warning text-[10px] flex items-center gap-0.5">
                      <TrendingDown size={10} /> Low
                    </span>
                  )}
                </div>

                {/* Quantity bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-600 font-medium">{res.quantity_available} available</span>
                    <span className="text-orange-600 font-medium">{res.quantity_reserved} reserved</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${total > 0 ? (res.quantity_available / total) * 100 : 0}%` }} />
                    <div className="bg-orange-400 h-full" style={{ width: `${occupancyPct}%` }} />
                  </div>
                  <p className="text-[10px] text-neutral-400">Total: {total} • Low stock at: {res.low_stock_threshold}</p>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
                  {pos && <span className="flex items-center gap-1"><MapPin size={12} /> {pos[0].toFixed(3)}, {pos[1].toFixed(3)}</span>}
                  <span>Updated {timeAgo(res.updated_at)}</span>
                </div>

                {/* Quick edit */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  <input
                    type="number"
                    className="input btn-sm w-24"
                    value={res.quantity_available}
                    onChange={async (e) => {
                      try {
                        await updateResource.mutateAsync({ id: res.id, updates: { quantity_available: parseInt(e.target.value) || 0 } });
                        toast('Quantity updated', 'success');
                      } catch { toast('Failed to update', 'error'); }
                    }}
                  />
                  <span className="text-xs text-neutral-400">Available</span>
                  <button className="btn-ghost btn-sm ml-auto" onClick={() => setEditingId(res.id)}>
                    <Edit size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No resources" message="Add a resource to start tracking inventory." />
      )}

      {showCreate && (
        <ResourceFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            try {
              await createResource.mutateAsync(data);
              toast('Resource created', 'success');
              setShowCreate(false);
            } catch { toast('Failed to create resource', 'error'); }
          }}
        />
      )}

      {editingId && (
        <ResourceFormModal
          resource={resources.data?.find((r) => r.id === editingId)}
          onClose={() => setEditingId(null)}
          onSubmit={async (data) => {
            try {
              await updateResource.mutateAsync({ id: editingId, updates: data });
              toast('Resource updated', 'success');
              setEditingId(null);
            } catch { toast('Failed to update resource', 'error'); }
          }}
        />
      )}
    </DashboardLayout>
  );
}

function ResourceFormModal({
  resource,
  onSubmit,
  onClose,
}: {
  resource?: { name: string; type: string; quantity_available: number; quantity_reserved: number; location: string | null; low_stock_threshold: number };
  onSubmit: (data: { name: string; type: string; quantity_available: number; quantity_reserved: number; latitude?: number; longitude?: number; low_stock_threshold: number }) => void;
  onClose: () => void;
}) {
  const pos = resource?.location ? parseLocation(resource.location) : null;
  const [name, setName] = useState(resource?.name ?? '');
  const [type, setType] = useState(resource?.type ?? 'drinking_water');
  const [avail, setAvail] = useState(resource?.quantity_available ?? 0);
  const [reserved, setReserved] = useState(resource?.quantity_reserved ?? 0);
  const [threshold, setThreshold] = useState(resource?.low_stock_threshold ?? 5);
  const [lat, setLat] = useState(pos?.[0] ?? 28.61);
  const [lng, setLng] = useState(pos?.[1] ?? 77.2);

  return (
    <Modal open onClose={onClose} title={resource ? 'Edit Resource' : 'New Resource'} size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Resource Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Rescue Boats Depot A" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Available</label>
            <input type="number" min={0} className="input" value={avail} onChange={(e) => setAvail(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Reserved</label>
            <input type="number" min={0} className="input" value={reserved} onChange={(e) => setReserved(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Low Stock At</label>
            <input type="number" min={0} className="input" value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <button className="btn-primary" disabled={!name} onClick={() => onSubmit({ name, type, quantity_available: avail, quantity_reserved: reserved, latitude: lat, longitude: lng, low_stock_threshold: threshold })}>
            {resource ? 'Save Changes' : 'Create Resource'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
