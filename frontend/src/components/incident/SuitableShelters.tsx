import { useState } from 'react';
import { Link } from 'react-router-dom';
import { House } from 'lucide-react';
import { useShelters } from '@/hooks/useData';
import { parseLocation, type Shelter } from '@/types';
import { distanceKm, timeAgo } from '@/lib/utils';

const STALE_MS = 6 * 3_600_000;
const NEEDS = [
  ['wheelchair_access', 'Wheelchair access'],
  ['medical_support', 'Medical support'],
  ['family_area', 'Women / family area'],
] as const;
type Need = (typeof NEEDS)[number][0];

// Shelters that have space and confirmed facilities for this incident's needs, nearest first.
export function SuitableShelters({ position, needVulnerable }: { position: [number, number] | null; needVulnerable?: boolean }) {
  const shelters = useShelters();
  const [needs, setNeeds] = useState<Need[]>(needVulnerable ? ['wheelchair_access'] : []);

  const candidates = (shelters.data ?? [])
    .filter((s) => s.status === 'open' && s.capacity - s.occupancy > 0)
    .filter((s) => needs.every((need) => s[need] === true))
    .map((s) => {
      const loc = parseLocation(s.location);
      return { shelter: s, km: position && loc ? distanceKm(position, loc) : null };
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
    .slice(0, 4);

  return (
    <div className="card card-body">
      <h3 className="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2"><House size={14} /> Suitable shelters</h3>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        {NEEDS.map(([key, label]) => (
          <label key={key} className="text-xs text-neutral-600 flex items-center gap-1.5">
            <input type="checkbox" checked={needs.includes(key)} onChange={(e) => setNeeds((current) => (e.target.checked ? [...current, key] : current.filter((n) => n !== key)))} /> {label}
          </label>
        ))}
      </div>
      {shelters.isLoading ? <p className="text-xs text-neutral-400">Loading shelters…</p> : candidates.length ? (
        <ul className="space-y-2">
          {candidates.map(({ shelter, km }) => <ShelterRow key={shelter.id} shelter={shelter} km={km} />)}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">No open shelter with free space{needs.length ? ' and the selected facilities confirmed' : ''}. <Link to="/shelters" className="text-primary-600 underline">Shelter directory</Link></p>
      )}
      <p className="text-[10px] text-neutral-400 mt-3">Distances are straight-line estimates. A listed shelter is not a guarantee of safety.</p>
    </div>
  );
}

function ShelterRow({ shelter, km }: { shelter: Shelter; km: number | null }) {
  const stale = Date.now() - new Date(shelter.last_updated_at).getTime() > STALE_MS;
  return (
    <li className="rounded-lg border border-neutral-200 p-2.5 text-xs">
      <div className="flex justify-between gap-2">
        <span className="font-medium text-neutral-800">{shelter.name}</span>
        <span className="text-neutral-500">{km === null ? 'distance unknown' : `${km.toFixed(1)} km`}</span>
      </div>
      <p className="text-neutral-600 mt-0.5">{shelter.capacity - shelter.occupancy} of {shelter.capacity} spaces free</p>
      <p className={stale ? 'text-amber-700 mt-0.5' : 'text-neutral-400 mt-0.5'}>Updated {timeAgo(shelter.last_updated_at)}{stale && ' — may be out of date'}</p>
    </li>
  );
}
