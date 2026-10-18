import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import { Route, Check, RotateCcw, TriangleAlert, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useToast } from '@/components/ui/toast-context';
import { EmptyState } from '@/components/ui/States';
import { PriorityGauge } from '@/components/ui/PriorityGauge';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';
import type { DispatchPlan, RoadClosure } from '@/types';
import 'leaflet/dist/leaflet.css';
import { EarlyActionPanel } from '@/components/planning/EarlyActionPanel';

const tileUrl = import.meta.env.VITE_MAPTILER_KEY ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${import.meta.env.VITE_MAPTILER_KEY}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function ClosureClicks({ points, onAdd }: { points: [number, number][]; onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) });
  return <>{points.map((p, i) => <Marker key={i} position={p} />)}{points.length > 2 && <Polygon positions={points} pathOptions={{ color: '#C2510C', dashArray: '6 6' }} />}</>;
}

const failed = (toast: (m: string, t: 'error') => void) => (error: unknown) => toast(error instanceof Error ? error.message : 'That did not work. Try again.', 'error');

export function PlanningPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  const plans = useQuery({ queryKey: ['dispatch-plans'], queryFn: async () => { const { data, error } = await supabase.from('dispatch_plans').select('*').order('created_at', { ascending: false }).limit(10); if (error) throw error; return data as DispatchPlan[]; } });
  const closures = useQuery({ queryKey: ['road-closures'], queryFn: async () => { const { data, error } = await supabase.rpc('list_active_road_closures'); if (error) throw error; return data as RoadClosure[]; } });
  const generate = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('admin_generate_dispatch_plan', { p_reason: 'Coordinator requested plan' }); if (error) throw error; }, onSuccess: () => { toast('New draft plan ready', 'success'); void qc.invalidateQueries({ queryKey: ['dispatch-plans'] }); }, onError: failed(toast) });
  const approve = useMutation({ mutationFn: async (id: string) => { const { data, error } = await supabase.rpc('admin_approve_dispatch_plan', { p_plan_id: id }); if (error) throw error; return Number(data); }, onSuccess: (n) => { toast(`${n} ${n === 1 ? 'team' : 'teams'} assigned. Gaps stay listed until resolved.`, 'success'); void qc.invalidateQueries({ queryKey: ['dispatch-plans'] }); }, onError: failed(toast) });
  const createClosure = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('admin_create_road_closure', { p_name: name, p_reason: reason, p_coordinates: points, p_trust_level: 'confirmed', p_expires_at: null }); if (error) throw error; }, onSuccess: () => { toast('Road closure saved. A new draft plan was made.', 'success'); setPoints([]); setName(''); setReason(''); void qc.invalidateQueries({ queryKey: ['road-closures'] }); void qc.invalidateQueries({ queryKey: ['dispatch-plans'] }); }, onError: failed(toast) });

  const current = plans.data?.[0];
  const history = plans.data?.slice(1) ?? [];
  const assigned = current?.plan.filter((item) => item.team_id).length ?? 0;
  const gaps = current?.plan.filter((item) => item.gap).length ?? 0;

  return (
    <DashboardLayout title="Dispatch & early action" subtitle="Who gets which team, and what to move before reports arrive. Nothing is sent until you approve it."
      actions={<button className="btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}><Route size={16} aria-hidden="true" />Make a new plan</button>}>
      <EarlyActionPanel />

      <section className="card mb-5 overflow-hidden" aria-labelledby="plan-title">
        <div className="panel-head flex-wrap">
          <div>
            <h2 id="plan-title" className="panel-title">{current ? (current.status === 'draft' ? 'Draft plan' : current.status === 'approved' ? 'Approved plan' : 'Replaced plan') : 'Dispatch plan'}</h2>
            {current && <p className="text-sm text-neutral-500">{current.trigger_reason}, {timeAgo(current.created_at)}. {assigned} matched, {gaps} without a team.</p>}
          </div>
          {current?.status === 'draft' && <button className="btn-primary btn-sm" disabled={approve.isPending} onClick={() => approve.mutate(current.id)}><Check size={16} aria-hidden="true" />Approve and assign</button>}
        </div>
        {!current ? (
          <EmptyState icon={<Route size={28} />} title="No plan yet" message="Make a plan to match every waiting incident to the best free team, most urgent first. Road closures and lost teams make a new draft automatically." />
        ) : current.plan.length === 0 ? (
          <EmptyState title="Nothing to plan" message="No incidents are waiting for a team." />
        ) : (
          <ol className="divide-y divide-line">
            {current.plan.map((item) => (
              <li key={item.incident_id} className="grid gap-3 px-5 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                <Link to={`/incidents/${item.incident_id}`} className="flex items-center gap-3 hover:underline">
                  <PriorityGauge score={item.score} level={item.priority} size="sm" showLabel={false} />
                  <span><span className="block font-display text-lg font-bold">{item.report_code}</span><span className="text-sm capitalize text-neutral-500">{item.priority}, score {item.score}</span></span>
                </Link>
                {item.team_name ? (
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><ArrowRight size={16} aria-hidden="true" className="text-primary-600" />{item.team_name}{item.straight_line_km != null && <span className="font-normal text-neutral-500">{item.straight_line_km} km away</span>}</p>
                    {item.reason && <p className="mt-1 text-[15px] text-neutral-600">{item.reason}</p>}
                  </div>
                ) : (
                  <p className="flex items-start gap-2 font-semibold text-critical"><TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />{item.gap ?? 'No team available'}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {history.length > 0 && (
          <details className="border-t border-line px-5 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-600">Earlier plans ({history.length})</summary>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">{history.map((plan) => <li key={plan.id}><span className="capitalize">{plan.status}</span>: {plan.trigger_reason}, {timeAgo(plan.created_at)}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="card overflow-hidden" aria-labelledby="closure-title">
        <div className="panel-head">
          <div>
            <h2 id="closure-title" className="panel-title">Road closures</h2>
            <p className="text-sm text-neutral-500">Tap at least three points around the blocked area. Routes and ETAs avoid it, and the plan is redone.</p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => setPoints([])} disabled={!points.length}><RotateCcw size={15} aria-hidden="true" />Clear points</button>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <div className="h-80 lg:h-[380px]">
            <MapContainer center={[33.6844, 73.0479]} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={tileUrl} attribution="&copy; OpenStreetMap contributors" />
              <ClosureClicks points={points} onAdd={(p) => setPoints((c) => [...c, p])} />
              {closures.data?.map((c) => <Polygon key={c.id} positions={c.geojson.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: '#C2510C' }} />)}
            </MapContainer>
          </div>
          <div className="space-y-3 border-t border-line p-5 lg:border-l lg:border-t-0">
            <p className="text-sm text-neutral-600">{points.length} {points.length === 1 ? 'point' : 'points'} placed{points.length < 3 ? `. ${3 - points.length} more needed.` : '.'}</p>
            <div><label htmlFor="closure-name" className="label">Name</label><input id="closure-name" className="input" placeholder="Korang bridge" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label htmlFor="closure-reason" className="label">Why it is closed</label><input id="closure-reason" className="input" placeholder="Bridge under water, police report" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <button className="btn-primary w-full" disabled={points.length < 3 || !name.trim() || !reason.trim() || createClosure.isPending} onClick={() => createClosure.mutate()}>Save closure and replan</button>
            {!!closures.data?.length && (
              <div className="border-t border-line pt-3">
                <p className="text-sm font-semibold">Active closures</p>
                <ul className="mt-1 space-y-1 text-sm">{closures.data.map((c) => <li key={c.id}><strong>{c.name}</strong> <span className="text-neutral-500">{c.reason}</span></li>)}</ul>
              </div>
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
