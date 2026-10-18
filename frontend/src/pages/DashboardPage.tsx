import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, TriangleAlert, FileText, BellRing, Plus, Eye, Route, CloudRain, type LucideIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IncidentMap, type MapArea } from '@/components/map/IncidentMap';
import { PriorityBadge, TeamStatusBadge } from '@/components/ui/Badges';
import { PriorityGauge } from '@/components/ui/PriorityGauge';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useDashboardSummary, useIncidents, useTeams, useResources, useShelters, useAlerts, useAssignments, useAcknowledgeAlert, useDangerZones } from '@/hooks/useData';
import { useWeatherWarnings } from '@/hooks/useWeatherWarnings';
import { useOperationArea } from '@/lib/region';
import { useToast } from '@/components/ui/toast-context';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';
import { ALERT_TYPE_LABELS, INCIDENT_TYPE_LABELS, TEAM_MARKER_COLORS, TEAM_STATUS_LABELS, type VulnerabilityArea } from '@/types';
import { enableBrowserNotifications } from '@/lib/notifications';
import { WeatherSafetyPanel } from '@/components/weather/WeatherSafetyPanel';

type SilentZone = { area_id: string; area_name: string; recent_reports: number; population: number };

function useUnseenPicture() {
  return useQuery({
    queryKey: ['dashboard-unseen'],
    queryFn: async () => {
      const [areas, silent, checkins, moves] = await Promise.all([
        supabase.from('areas').select('id,name,vulnerability_index,boundary,is_demo'),
        supabase.rpc('list_silent_zones'),
        supabase.from('safety_checkins').select('status'),
        supabase.from('prepositioning_suggestions').select('id').eq('status', 'suggested'),
      ]);
      const checkinRows = (checkins.data ?? []) as { status: string }[];
      return {
        areas: (areas.data ?? []) as unknown as VulnerabilityArea[],
        silent: (silent.data ?? []) as SilentZone[],
        awaiting: checkinRows.filter((row) => row.status === 'pending').length,
        noReply: checkinRows.filter((row) => row.status === 'no_response' || row.status === 'needs_help').length,
        pendingMoves: moves.data?.length ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}

function QuestionTile({ to, icon: Icon, question, value, detail, tone }: { to: string; icon: LucideIcon; question: string; value: React.ReactNode; detail: string; tone: 'danger' | 'calm' }) {
  return (
    <Link to={to} className="group card flex flex-col gap-3 p-5 transition-colors hover:border-neutral-300">
      <span className="flex items-center gap-2 text-[15px] font-semibold text-neutral-600"><Icon size={18} aria-hidden="true" className={tone === 'danger' ? 'text-critical' : 'text-primary-600'} />{question}</span>
      <span className={`font-display text-[40px] font-bold leading-none ${tone === 'danger' ? 'text-critical' : 'text-ink'}`}>{value}</span>
      <span className="text-[15px] text-neutral-600">{detail}</span>
    </Link>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const area = useOperationArea();
  const summary = useDashboardSummary();
  const incidents = useIncidents({ limit: 500 });
  const teams = useTeams();
  const resources = useResources();
  const shelters = useShelters();
  const alerts = useAlerts();
  const dangerZones = useDangerZones();
  const assignments = useAssignments();
  const ackAlert = useAcknowledgeAlert();
  const unseen = useUnseenPicture();
  const weather = useWeatherWarnings();
  const [layers, setLayers] = useState({ areas: true, incidents: true, dangerZones: true, teams: true, shelters: true, supplies: false });

  const openIncidents = useMemo(() => (incidents.data ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status)), [incidents.data]);
  const waiting = openIncidents.filter((i) => ['reported', 'verified'].includes(i.status));
  const criticalUnassigned = waiting.filter((i) => i.priority_level === 'critical');
  const nextUp = [...waiting].sort((a, b) => b.priority_score - a.priority_score || a.created_at.localeCompare(b.created_at)).slice(0, 6);
  const availableTeams = (teams.data ?? []).filter((t) => t.status === 'available').length;
  const openShelters = (shelters.data ?? []).filter((s) => s.status !== 'closed');
  const shelterFree = openShelters.reduce((sum, s) => sum + Math.max(0, s.capacity - s.occupancy), 0);
  const activeByTeam = new Map((assignments.data ?? []).filter((a) => ['assigned', 'dispatched'].includes(a.status)).map((a) => [a.team_id, a]));
  const incidentById = new Map((incidents.data ?? []).map((i) => [i.id, i]));
  const unackAlerts = (alerts.data ?? []).filter((a) => !a.acknowledged);
  const silentIds = new Set((unseen.data?.silent ?? []).map((zone) => zone.area_id));
  const mapAreas: MapArea[] = (unseen.data?.areas ?? []).map((a) => ({ ...a, silent: silentIds.has(a.id) }));
  const warnings = weather.data?.warnings ?? [];
  const silentCount = unseen.data?.silent.length ?? 0;
  const atRiskSignal = silentCount + (unseen.data?.noReply ?? 0);

  const handleAck = async (id: string) => {
    try { await ackAlert.mutateAsync(id); toast('Alert acknowledged', 'success'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not acknowledge the alert', 'error'); }
  };
  const enableNotifications = async () => {
    try { await enableBrowserNotifications(); toast('Browser notifications are on', 'success'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not turn on notifications', 'error'); }
  };

  return (
    <DashboardLayout title="Overview" subtitle={area} actions={<>
      <button className="btn-secondary btn-sm" onClick={() => navigate('/reports/summary')}><FileText size={16} aria-hidden="true" />Situation report</button>
      <button className="btn-secondary btn-sm" onClick={() => void enableNotifications()}><BellRing size={16} aria-hidden="true" />Browser alerts</button>
      <button className="btn-primary btn-sm" onClick={() => navigate('/report')}><Plus size={16} aria-hidden="true" />Log incident</button>
    </>}>
      {criticalUnassigned.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-panel border border-[#F0C2BC] bg-[#FBE4E1] px-4 py-3 text-critical" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <strong>{criticalUnassigned.length} critical {criticalUnassigned.length === 1 ? 'incident has' : 'incidents have'} no team yet.</strong>
          <span className="text-ink">Oldest reported {timeAgo(criticalUnassigned.reduce((oldest, i) => (i.created_at < oldest ? i.created_at : oldest), criticalUnassigned[0].created_at))}.</span>
          <Link to="/incidents?priority=critical" className="ml-auto font-semibold underline underline-offset-2">Open the queue</Link>
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <QuestionTile to="/vulnerability" icon={Eye} question="Who is most at risk?" tone={atRiskSignal ? 'danger' : 'calm'}
          value={unseen.isLoading ? <Skeleton className="h-10 w-16" /> : atRiskSignal}
          detail={silentCount ? `${silentCount} silent ${silentCount === 1 ? 'zone' : 'zones'} and ${unseen.data?.noReply ?? 0} unanswered or help-requested check-ins` : unseen.data?.awaiting ? `${unseen.data.awaiting} residents have not answered "Are you safe?" yet` : 'No silent zones. Every warned resident has answered.'} />
        <QuestionTile to="/incidents" icon={Route} question="Who gets help first?" tone={criticalUnassigned.length ? 'danger' : 'calm'}
          value={incidents.isLoading ? <Skeleton className="h-10 w-16" /> : waiting.length}
          detail={`${waiting.length === 1 ? 'incident is' : 'incidents are'} waiting for a team. ${availableTeams} of ${teams.data?.length ?? 0} teams are free.`} />
        <QuestionTile to="/planning" icon={CloudRain} question="How early can we act?" tone={warnings.length ? 'danger' : 'calm'}
          value={weather.isLoading ? <Skeleton className="h-10 w-16" /> : warnings.length}
          detail={warnings.length ? `Active weather ${warnings.length === 1 ? 'warning' : 'warnings'}: ${warnings.map((w) => w.title.toLowerCase()).join(', ')}. ${unseen.data?.pendingMoves ?? 0} moves to approve.` : 'No weather warning in the next 24 hours.'} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <section className="card overflow-hidden" aria-labelledby="map-title">
          <div className="panel-head flex-wrap">
            <h2 id="map-title" className="panel-title">Response map</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {([['areas', 'Vulnerability'], ['incidents', 'Incidents'], ['dangerZones', 'Danger zones'], ['teams', 'Teams'], ['shelters', 'Shelters'], ['supplies', 'Supplies']] as const).map(([key, label]) => (
                <label key={key} className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-primary-600" checked={layers[key]} onChange={(e) => setLayers((current) => ({ ...current, [key]: e.target.checked }))} />{label}</label>
              ))}
            </div>
          </div>
          <div className="[&>.card]:rounded-none [&>.card]:border-0">
            {incidents.isLoading || teams.isLoading ? <Skeleton className="h-[460px] w-full rounded-none" /> : (
              <IncidentMap incidents={openIncidents} teams={teams.data ?? []} resources={resources.data ?? []} shelters={shelters.data ?? []}
                dangerZones={layers.dangerZones ? dangerZones.data ?? [] : []} areas={layers.areas ? mapAreas : []}
                showIncidents={layers.incidents} showTeams={layers.teams} showShelters={layers.shelters} showResources={layers.supplies}
                onIncidentClick={(id) => navigate(`/incidents/${id}`)} height="460px" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-5 py-3 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-critical" />Critical</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-high" />High</span>
            {(['available', 'en_route'] as const).map((status) => <span key={status} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_MARKER_COLORS[status] }} />Team {TEAM_STATUS_LABELS[status].toLowerCase()}</span>)}
            <span className="inline-flex items-center gap-1.5"><i className="h-3 w-4 border-2 border-dashed border-high" />Silent zone</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-3 w-4 bg-primary-600/40" />Higher vulnerability</span>
          </div>
        </section>

        <section className="card flex flex-col" aria-labelledby="next-title">
          <div className="panel-head">
            <h2 id="next-title" className="panel-title">Next up</h2>
            <Link to="/incidents" className="text-sm font-semibold text-primary-700 hover:underline">Full queue</Link>
          </div>
          {incidents.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : nextUp.length ? (
            <ol className="divide-y divide-line">
              {nextUp.map((incident) => (
                <li key={incident.id}>
                  <Link to={`/incidents/${incident.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50">
                    <PriorityGauge score={incident.priority_score} level={incident.priority_level} size="sm" showLabel={false} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><strong className="font-display text-lg">{incident.report_code}</strong>{incident.incident_origin === 'proactive_check' && <span className="badge-info">Welfare check</span>}{incident.is_proxy_report && <span className="badge-neutral">For someone else</span>}</span>
                      <span className="block truncate text-sm text-neutral-600">{INCIDENT_TYPE_LABELS[incident.type]}{incident.area_landmark ? `, ${incident.area_landmark}` : ''}</span>
                      <span className="block text-sm text-neutral-500">Waiting {timeAgo(incident.created_at).replace(' ago', '')}</span>
                    </span>
                    <span className="text-end"><span className="block font-display text-2xl font-bold leading-none">{incident.priority_score}</span><PriorityBadge level={incident.priority_level} className="mt-1" /></span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <EmptyState icon={<Check size={28} />} title="Nobody is waiting" message="New reports appear here, most urgent first." />}
        </section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <section className="card overflow-hidden" aria-labelledby="teams-title">
          <div className="panel-head">
            <h2 id="teams-title" className="panel-title">Teams</h2>
            <Link to="/teams" className="text-sm font-semibold text-primary-700 hover:underline">Manage teams</Link>
          </div>
          {teams.data?.length ? (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Team</th><th>Working on</th><th>People</th><th>Status</th><th>Updated</th></tr></thead><tbody>
              {[...teams.data].sort((a, b) => Number(activeByTeam.has(b.id)) - Number(activeByTeam.has(a.id))).slice(0, 6).map((team) => {
                const active = activeByTeam.get(team.id);
                const incident = active ? incidentById.get(active.incident_id) : undefined;
                return <tr key={team.id}><td><strong>{team.name}</strong><span className="block text-[13px] text-neutral-500">{team.team_code}</span></td><td>{incident ? <Link className="font-semibold text-primary-700 hover:underline" to={`/incidents/${incident.id}`}>{incident.report_code}</Link> : <span className="text-neutral-500">Nothing</span>}</td><td>{team.capacity}</td><td><TeamStatusBadge status={team.status} /></td><td className="text-neutral-500">{timeAgo(team.updated_at)}</td></tr>;
              })}
            </tbody></table></div>
          ) : <EmptyState title="No teams yet" message="Add rescue teams so incidents can be assigned." action={<Link to="/teams" className="btn-secondary btn-sm">Add a team</Link>} />}
        </section>

        <section className="card flex flex-col" aria-labelledby="alerts-title">
          <div className="panel-head">
            <h2 id="alerts-title" className="panel-title">Alerts to acknowledge</h2>
            <Link to="/alerts" className="text-sm font-semibold text-primary-700 hover:underline">All alerts</Link>
          </div>
          {alerts.isLoading ? <div className="p-5"><Skeleton className="h-16 w-full" /></div> : unackAlerts.length ? (
            <ul className="divide-y divide-line">
              {unackAlerts.slice(0, 5).map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{alert.message}</p>
                    <p className="mt-1 text-sm text-neutral-500">{ALERT_TYPE_LABELS[alert.type] ?? alert.type}, {timeAgo(alert.created_at)}{alert.incident_id && <> · <Link className="font-semibold text-primary-700 hover:underline" to={`/incidents/${alert.incident_id}`}>{alert.incidents?.report_code ?? 'Incident'}</Link></>}</p>
                  </div>
                  <PriorityBadge level={alert.severity} />
                  <button className="btn-ghost btn-sm" onClick={() => void handleAck(alert.id)} aria-label={`Acknowledge: ${alert.message}`}><Check size={16} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Check size={28} />} title="All caught up" message="New alerts appear here until someone acknowledges them." />}
          <p className="mt-auto border-t border-line px-5 py-3 text-sm text-neutral-500">{openShelters.length ? `${shelterFree} shelter spaces free across ${openShelters.length} shelters.` : 'No shelters recorded yet.'} <Link to="/shelters" className="font-semibold text-primary-700 hover:underline">Shelters</Link></p>
        </section>
      </div>

      <WeatherSafetyPanel incidents={openIncidents} />
      <p className="mt-2 text-sm text-neutral-500">{summary.dataUpdatedAt ? `Updated ${timeAgo(new Date(summary.dataUpdatedAt).toISOString())}. ` : ''}Map is for coordination, not navigation.</p>
    </DashboardLayout>
  );
}
