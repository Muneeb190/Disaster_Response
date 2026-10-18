import { useState } from 'react';
import { House, RefreshCw } from 'lucide-react';
import { usePublicShelterSuggestions } from '@/hooks/useData';
import { timeAgo } from '@/lib/utils';

const NEEDS = [
  ['wheelchair_access', 'Wheelchair access'],
  ['medical_support', 'Medical support'],
  ['family_area', 'Women / family area'],
  ['has_power', 'Electricity'],
] as const;

export function PublicShelterSuggestions({
  reportCode,
  trackingToken,
  vulnerable,
}: {
  reportCode: string;
  trackingToken: string;
  vulnerable?: boolean;
}) {
  const [needs, setNeeds] = useState<string[]>(vulnerable ? ['wheelchair_access'] : []);
  const shelters = usePublicShelterSuggestions(reportCode, trackingToken, needs);

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><House size={16} /> Suitable nearby shelters</h3>
          <p className="mt-1 text-xs text-emerald-800">Only open shelters with reported free space are shown.</p>
        </div>
        <button className="btn-ghost btn-sm p-1.5" onClick={() => void shelters.refetch()} aria-label="Refresh shelter availability">
          <RefreshCw size={14} className={shelters.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {NEEDS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-emerald-950">
            <input
              type="checkbox"
              checked={needs.includes(key)}
              onChange={(event) => setNeeds((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))}
            />
            {label}
          </label>
        ))}
      </div>
      {shelters.isLoading ? (
        <p className="mt-4 text-xs text-emerald-800">Checking current shelter records…</p>
      ) : shelters.error ? (
        <p className="mt-4 text-xs text-red-700">Shelter availability could not be loaded. Coordinators can still guide you.</p>
      ) : shelters.data?.length ? (
        <ul className="mt-4 space-y-2">
          {shelters.data.map((shelter) => (
            <li key={shelter.id} className="rounded-lg border border-emerald-200 bg-white p-3 text-xs">
              <div className="flex justify-between gap-3">
                <strong className="text-neutral-800">{shelter.name}</strong>
                <span className="whitespace-nowrap text-neutral-600">{Number(shelter.distance_km).toFixed(1)} km</span>
              </div>
              {shelter.address && <p className="mt-1 text-neutral-600">{shelter.address}</p>}
              <p className="mt-1 text-emerald-800">{shelter.spaces_available} of {shelter.capacity} spaces currently free</p>
              <p className="mt-1 text-neutral-500">Updated {timeAgo(shelter.last_updated_at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-amber-800">No open shelter currently matches the selected needs. Do not travel without coordinator guidance.</p>
      )}
      <p className="mt-3 text-xs text-emerald-900">Distance is a straight-line estimate, not a safe-route guarantee. Capacity can change quickly.</p>
    </section>
  );
}
