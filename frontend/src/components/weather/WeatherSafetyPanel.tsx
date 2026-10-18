import { CloudRain, ShieldAlert, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PriorityBadge } from '@/components/ui/Badges';
import { Skeleton } from '@/components/ui/States';
import { useWeatherWarnings } from '@/hooks/useWeatherWarnings';
import type { Incident } from '@/types';

export function WeatherSafetyPanel({ incidents }: { incidents: Incident[] }) {
  const weather = useWeatherWarnings();
  if (weather.isLoading) return <Skeleton className="h-44 w-full" />;
  if (weather.error) return <div className="card card-body text-sm text-neutral-500"><CloudRain size={18} /> Weather warning feed is temporarily unavailable.</div>;
  const warnings = weather.data?.warnings ?? [];
  const candidates = incidents.filter((incident) => !['resolved', 'cancelled'].includes(incident.status) && incident.priority_level !== 'critical' && warnings.some((warning) => warning.incident_types.includes(incident.type)));

  return <section className="card card-body mb-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="font-semibold flex items-center gap-2"><CloudRain size={17} /> Weather warnings</h2><p className="text-xs text-neutral-500 mt-1">Next 24 hours · {weather.data?.area} · forecast guidance, not an official evacuation order</p></div>
      <span className="badge-neutral">{weather.data?.source}</span>
    </div>
    {!warnings.length ? <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mt-3">No severe weather threshold is currently triggered. Continue monitoring local authorities.</p> : <div className="grid lg:grid-cols-2 gap-3 mt-3">
      {warnings.map((warning) => <div key={warning.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center justify-between gap-2"><strong className="text-sm flex items-center gap-1.5"><ShieldAlert size={15} /> {warning.title}</strong><PriorityBadge level={warning.severity} /></div>
        <p className="text-xs text-neutral-600 mt-1">{warning.detail}</p>
        <p className="text-xs font-semibold mt-3">Public safety instructions</p>
        <ul className="list-disc pl-4 mt-1 space-y-1">{warning.instructions.map((instruction) => <li key={instruction} className="text-xs text-neutral-700">{instruction}</li>)}</ul>
      </div>)}
    </div>}
    {!!candidates.length && <div className="mt-4 border-t pt-3"><p className="text-sm font-semibold text-red-700 flex items-center gap-2"><Siren size={16} /> Early risk escalation · {candidates.length} incident{candidates.length === 1 ? '' : 's'} need review</p><p className="text-xs text-neutral-500 mt-1">Weather conditions overlap these incident types before they become critical.</p><div className="flex flex-wrap gap-2 mt-2">{candidates.slice(0, 8).map((incident) => <Link key={incident.id} to={`/incidents/${incident.id}`} className="btn-secondary btn-sm">{incident.report_code}{incident.area_landmark ? ` · ${incident.area_landmark}` : ''}</Link>)}</div></div>}
  </section>;
}
