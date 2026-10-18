import { useState } from 'react';
import { Plus, Package, MapPin, TrendingDown, Edit, ArrowUpDown } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { DemoBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState, LoadingSpinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { LocationField } from '@/components/map/LocationField';
import { useResources, useCreateResource, useUpdateResource, useAdjustResource } from '@/hooks/useData';
import { parseLocation, type Resource } from '@/types';
import { timeAgo } from '@/lib/utils';

const RESOURCE_TYPES = ['boat', 'ambulance', 'vehicle', 'medical_kit', 'drinking_water', 'food', 'blanket', 'fuel', 'communication'];

export function ResourcesPage() {
  const { toast } = useToast();
  const resources = useResources();
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Resource | null>(null);
  const lowCount = (resources.data ?? []).filter((r) => r.quantity_available <= r.low_stock_threshold).length;

  return (
    <DashboardLayout
      title="Resources"
      subtitle="Inventory, reservations and low-stock warnings"
      actions={<button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={16} /> New resource</button>}
    >
      {lowCount > 0 && (
        <div className="card card-body mb-4 border-l-4 border-l-orange-400 text-sm text-orange-800 flex items-center gap-2">
          <TrendingDown size={16} /> {lowCount} {lowCount === 1 ? 'item is' : 'items are'} at or below the low-stock threshold.
        </div>
      )}
      {resources.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : resources.data?.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...resources.data].sort((a, b) => Number(b.quantity_available <= b.low_stock_threshold) - Number(a.quantity_available <= a.low_stock_threshold)).map((res) => {
            const pos = parseLocation(res.location);
            const isLow = res.quantity_available <= res.low_stock_threshold;
            const total = res.quantity_available + res.quantity_reserved;
            return (
              <div key={res.id} className={`card card-body ${isLow ? 'border-l-4 border-l-orange-400' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLow ? 'bg-orange-50' : 'bg-blue-50'}`}>
                      <Package size={20} className={isLow ? 'text-orange-600' : 'text-primary-600'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{res.name}</p>
                      <span className="text-[10px] text-neutral-400 capitalize">{res.type.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isLow && <span className="badge-warning text-[10px] flex items-center gap-0.5"><TrendingDown size={10} /> {res.quantity_available === 0 ? 'Out of stock' : 'Low'}</span>}
                    {res.is_demo && <DemoBadge />}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-600 font-medium">{res.quantity_available} available</span>
                    <span className="text-orange-600 font-medium">{res.quantity_reserved} reserved</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${total > 0 ? (res.quantity_available / total) * 100 : 0}%` }} />
                    <div className="bg-orange-400 h-full" style={{ width: `${total > 0 ? (res.quantity_reserved / total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[10px] text-neutral-400">Total {total} · low-stock warning at {res.low_stock_threshold}</p>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
                  {pos ? <span className="flex items-center gap-1"><MapPin size={12} /> {pos[0].toFixed(3)}, {pos[1].toFixed(3)}</span> : <span>No storage location</span>}
                  <span>Updated {timeAgo(res.updated_at)}</span>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  <button className="btn-secondary btn-sm" onClick={() => setAdjusting(res)}><ArrowUpDown size={14} /> Adjust stock</button>
                  <button className="btn-ghost btn-sm ml-auto" title="Edit details" onClick={() => setEditingId(res.id)}><Edit size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No resources yet" message="Add boats, vehicles, medical kits and supplies to start tracking inventory." />
      )}

      {adjusting && <AdjustStockModal resource={adjusting} onClose={() => setAdjusting(null)} />}

      {showCreate && (
        <ResourceFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            try {
              await createResource.mutateAsync({ ...data, quantity_available: data.quantity_available ?? 0, quantity_reserved: 0 });
              toast('Resource created', 'success');
              setShowCreate(false);
            } catch (err) { toast(err instanceof Error ? err.message : 'Failed to create resource', 'error'); }
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
            } catch (err) { toast(err instanceof Error ? err.message : 'Failed to update resource', 'error'); }
          }}
        />
      )}
    </DashboardLayout>
  );
}

// Every stock movement needs a reason so the history explains where items went.
function AdjustStockModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const { toast } = useToast();
  const adjust = useAdjustResource();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const delta = direction * amount;
  const tooMany = resource.quantity_available + delta < 0;

  const save = async () => {
    try {
      await adjust.mutateAsync({ id: resource.id, delta, reason: reason.trim() });
      toast(`${resource.name}: ${delta > 0 ? '+' : ''}${delta}`, 'success');
      onClose();
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to adjust stock', 'error'); }
  };

  return (
    <Modal open onClose={onClose} title={`Adjust stock · ${resource.name}`} size="sm">
      <p className="text-sm text-neutral-600 mb-3">{resource.quantity_available} available now. Reserved items ({resource.quantity_reserved}) change only through assignments.</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button type="button" className={`btn btn-sm ${direction === 1 ? 'bg-green-100 text-green-800' : 'btn-secondary'}`} onClick={() => setDirection(1)}>Add (received)</button>
        <button type="button" className={`btn btn-sm ${direction === -1 ? 'bg-orange-100 text-orange-800' : 'btn-secondary'}`} onClick={() => setDirection(-1)}>Remove (used / lost)</button>
      </div>
      <label className="label">Quantity</label>
      <input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))} />
      {tooMany && <p className="text-xs text-red-600 mt-1">Only {resource.quantity_available} available.</p>}
      <label className="label mt-3">Reason</label>
      <textarea className="input resize-none" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Delivery from district depot" />
      <p className="text-xs text-neutral-500 mt-2">New available quantity: <strong>{Math.max(0, resource.quantity_available + delta)}</strong></p>
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={adjust.isPending || tooMany || !reason.trim()} onClick={() => void save()}>{adjust.isPending ? <LoadingSpinner size={16} /> : 'Save'}</button>
      </div>
    </Modal>
  );
}

function ResourceFormModal({
  resource,
  onSubmit,
  onClose,
}: {
  resource?: Resource;
  onSubmit: (data: { name: string; type: string; quantity_available?: number; latitude?: number; longitude?: number; low_stock_threshold: number }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(resource?.name ?? '');
  const [type, setType] = useState(resource?.type ?? 'drinking_water');
  const [initialStock, setInitialStock] = useState(0);
  const [threshold, setThreshold] = useState(resource?.low_stock_threshold ?? 5);
  const [pos, setPos] = useState<[number, number] | null>(resource?.location ? parseLocation(resource.location) : null);

  return (
    <Modal open onClose={onClose} title={resource ? 'Edit resource' : 'New resource'} size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rescue boats — North depot" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {!resource && (
            <div>
              <label className="label">Starting stock</label>
              <input type="number" min={0} className="input" value={initialStock} onChange={(e) => setInitialStock(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
          )}
          <div>
            <label className="label">Warn at or below</label>
            <input type="number" min={0} className="input" value={threshold} onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
        </div>
        {resource && <p className="text-xs text-neutral-500">Use “Adjust stock” to change quantities so every change has a reason.</p>}
        <LocationField label="Storage location (optional)" value={pos} onChange={setPos} />
        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), type, quantity_available: resource ? undefined : initialStock, low_stock_threshold: threshold, latitude: pos?.[0], longitude: pos?.[1] })}>
            {resource ? 'Save changes' : 'Create resource'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
