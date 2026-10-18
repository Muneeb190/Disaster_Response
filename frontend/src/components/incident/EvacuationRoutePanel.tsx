import { useState } from 'react';
import { Navigation, Route } from 'lucide-react';
import { IncidentMap } from '@/components/map/IncidentMap';
import { LoadingSpinner } from '@/components/ui/States';
import { useDangerZones } from '@/hooks/useData';
import { parseLocation, type Incident } from '@/types';

export function EvacuationRoutePanel({ incident }: { incident: Incident }) {
  const start = parseLocation(incident.location);
  const zones = useDangerZones();
  const [lat, setLat] = useState('33.6938');
  const [lng, setLng] = useState('73.0652');
  const [profile, setProfile] = useState('driving-car');
  const [route, setRoute] = useState<[number, number][]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const calculate = async () => {
    if (!start) return;
    setLoading(true); setError(''); setRoute([]); setSummary(null);
    try {
      const polygons = (zones.data ?? []).map((z) => z.geojson).filter((g) => g.type === 'Polygon').flatMap((g) => g.coordinates as number[][][]);
      const avoid = polygons.length ? { type: 'MultiPolygon', coordinates: polygons.map((p) => [p]) } : undefined;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evacuation-route`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ start: [start[1], start[0]], end: [Number(lng), Number(lat)], profile, avoid_polygons: avoid }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not calculate route');
      const feature = data.features?.[0];
      setRoute((feature?.geometry?.coordinates ?? []).map(([x, y]: number[]) => [y, x] as [number, number]));
      setSummary(feature?.properties?.summary ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not calculate route'); }
    finally { setLoading(false); }
  };

  return <div className="card card-body">
    <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2"><Navigation size={15} /> Evacuation route</h3>
    <p className="text-xs text-neutral-500 mt-1">Calculates a route from this incident while avoiding active danger zones. Routes are advisory.</p>
    <div className="grid sm:grid-cols-3 gap-2 mt-3">
      <input className="input" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Safe destination latitude" />
      <input className="input" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Safe destination longitude" />
      <select className="select" value={profile} onChange={(e) => setProfile(e.target.value)}><option value="driving-car">Rescue vehicle</option><option value="driving-hgv">Heavy vehicle</option><option value="foot-walking">Walking</option><option value="wheelchair">Wheelchair</option></select>
    </div>
    <button className="btn-primary btn-sm mt-3 self-start" onClick={() => void calculate()} disabled={loading || !start}>{loading ? <LoadingSpinner size={14} /> : <Route size={14} />} Find safer route</button>
    {error && <p className="text-xs text-error mt-2">{error}</p>}
    {summary && <p className="text-xs font-medium text-blue-700 mt-3">{(summary.distance / 1000).toFixed(1)} km · approximately {Math.round(summary.duration / 60)} minutes</p>}
    {route.length > 1 && <div className="mt-3"><IncidentMap incidents={[incident]} dangerZones={zones.data ?? []} route={route} showTeams={false} showResources={false} height="320px" /></div>}
  </div>;
}
