import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Package, ArrowUpRight, Check, TriangleAlert, FileText, House, BellRing } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IncidentMap } from '@/components/map/IncidentMap';
import { DemoBadge, PriorityBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useDashboardSummary, useIncidents, useTeams, useResources, useShelters, useAlerts, useAssignments, useAcknowledgeAlert, useDemoPresence } from '@/hooks/useData';
import { useOperationArea, localTimeZoneLabel } from '@/lib/region';
import { useToast } from '@/components/ui/toast-context';
import { timeAgo } from '@/lib/utils';
import { ALERT_TYPE_LABELS, TEAM_MARKER_COLORS, TEAM_STATUS_LABELS, type TeamStatus } from '@/types';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const now = useNow();
  const area = useOperationArea();
  const demo = useDemoPresence();
  const summary = useDashboardSummary();
  const incidents = useIncidents({ limit: 500 });
  const teams = useTeams();
  const resources = useResources();
  const shelters = useShelters();
  const alerts = useAlerts();
  const assignments = useAssignments();
  const ackAlert = useAcknowledgeAlert();
  const [alertTab, setAlertTab] = useState<'latest' | 'unack' | 'ack'>('latest');
  const [layers, setLayers] = useState({ incidents: true, teams: true, shelters: true, supplies: true });

  const openIncidents = useMemo(() => (incidents.data ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status)), [incidents.data]);
  const criticalUnassigned = openIncidents.filter((i) => i.priority_level === 'critical' && ['reported', 'verified'].includes(i.status));
  const openShelters = (shelters.data ?? []).filter((s) => s.status !== 'closed');
  const shelterCapacity = openShelters.reduce((sum, s) => sum + s.capacity, 0);
  const shelterOccupancy = openShelters.reduce((sum, s) => sum + s.occupancy, 0);
  const teamCounts = (teams.data ?? []).reduce<Partial<Record<TeamStatus, number>>>((acc, team) => ({ ...acc, [team.status]: (acc[team.status] ?? 0) + 1 }), {});
  const activeByTeam = new Map((assignments.data ?? []).filter((a) => ['assigned', 'dispatched'].includes(a.status)).map((a) => [a.team_id, a]));
  const incidentById = new Map((incidents.data ?? []).map((i) => [i.id, i]));
  const supplyTypes = Object.entries((resources.data ?? []).reduce<Record<string, { available: number; total: number }>>((acc, r) => {
    const entry = acc[r.type] ?? { available: 0, total: 0 };
    return { ...acc, [r.type]: { available: entry.available + r.quantity_available, total: entry.total + r.quantity_available + r.quantity_reserved } };
  }, {})).slice(0, 4);

  const alertList = (alerts.data ?? []).filter((a) => alertTab === 'latest' || (alertTab === 'unack' ? !a.acknowledged : a.acknowledged));
  const unackCount = (alerts.data ?? []).filter((a) => !a.acknowledged).length;
  const fullestShelter = [...openShelters].sort((a, b) => b.occupancy / (b.capacity || 1) - a.occupancy / (a.capacity || 1))[0];
  const roomiestShelter = [...openShelters].filter((s) => s.status === 'open').sort((a, b) => (b.capacity - b.occupancy) - (a.capacity - a.occupancy))[0];
  const tz = localTimeZoneLabel();
  const syncedAgo = summary.dataUpdatedAt ? Math.max(0, Math.round((now - summary.dataUpdatedAt) / 1000)) : null;

  const handleAck = async (id: string) => {
    try {
      await ackAlert.mutateAsync(id);
      toast('Alert acknowledged', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to acknowledge alert', 'error');
    }
  };

  const kpis = [
    { label: 'Active incidents', value: summary.data?.openIncidents ?? 0, detail: `${summary.data?.criticalIncidents ?? 0} critical`, icon: TriangleAlert, tone: 'red', trend: `${summary.data?.reportedLastHour ?? 0} reported in the last hour` },
    { label: 'Teams available', value: `${teamCounts.available ?? 0} / ${teams.data?.length ?? 0}`, detail: 'ready to dispatch', icon: Users, tone: 'teal', trend: `${teamCounts.assigned ?? 0} busy · ${teamCounts.en_route ?? 0} travelling · ${(teamCounts.unavailable ?? 0) + (teamCounts.offline ?? 0)} out` },
    { label: 'Shelter space', value: openShelters.length ? `${Math.max(0, shelterCapacity - shelterOccupancy)}` : '—', detail: openShelters.length ? `of ${shelterCapacity} spaces free` : 'no shelters recorded', icon: House, tone: 'amber', trend: openShelters.length ? `${shelterCapacity ? Math.round((shelterOccupancy / shelterCapacity) * 100) : 0}% occupied · ${openShelters.filter((s) => s.status === 'full').length} full` : 'Add shelters on the Shelters page' },
    { label: 'Unacknowledged alerts', value: summary.data?.unacknowledgedAlerts ?? 0, detail: `${summary.data?.resourceShortages ?? 0} low-stock items`, icon: BellRing, tone: 'red', trend: `${summary.data?.activeAssignments ?? 0} active assignments` },
  ];

  return (
    <DashboardLayout title="Response overview" subtitle={area}>
      <div className="command-page-head">
        <div>
          <p className="command-breadcrumb">OPERATIONS / {area.toUpperCase()}</p>
          <div className="flex items-center gap-3"><h1>Response overview</h1>{demo.data && <DemoBadge />}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="command-time">
            <strong>{new Date(now).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} {tz}</strong>
            <span>{syncedAgo === null ? 'Waiting for data…' : `Last synced ${syncedAgo}s ago`}</span>
          </div>
          <button className="command-button command-button-light" onClick={() => navigate('/reports/summary')}><FileText size={14} /> Situation report</button>
          <button className="command-button command-button-teal" onClick={() => navigate('/report')}><span className="text-lg leading-none">+</span> Log incident</button>
        </div>
      </div>

      {criticalUnassigned.length > 0 && (
        <div className="command-advisory">
          <TriangleAlert size={16} /><strong>{criticalUnassigned.length} critical {criticalUnassigned.length === 1 ? 'incident has' : 'incidents have'} no team assigned</strong>
          <span className="command-advisory-separator" /> Oldest reported {timeAgo(criticalUnassigned.reduce((oldest, i) => (i.created_at < oldest ? i.created_at : oldest), criticalUnassigned[0].created_at))}.
          <button onClick={() => navigate('/incidents?priority=critical')}>Open queue <ArrowUpRight size={13} /></button>
        </div>
      )}

      <div className="command-kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return <div className="command-kpi" key={kpi.label}><div className={`command-kpi-icon command-kpi-icon-${kpi.tone}`}><Icon size={16} /></div><p>{kpi.label}</p><div className="flex items-baseline gap-2"><strong>{summary.isLoading ? <Skeleton className="w-14 h-8" /> : kpi.value}</strong><span className={`command-kpi-detail command-kpi-${kpi.tone}`}>{kpi.detail}</span></div><small>{kpi.trend}</small></div>;
        })}
      </div>

      <div className="command-workspace-grid">
        <section className="command-panel command-map-panel">
          <div className="command-panel-heading"><div><h2>Response map <span>{openIncidents.length} OPEN {openIncidents.length === 1 ? 'INCIDENT' : 'INCIDENTS'}</span></h2></div></div>
          <div className="command-map-controls">
            {([['incidents', 'Incidents'], ['teams', 'Teams'], ['shelters', 'Shelters'], ['supplies', 'Supplies']] as const).map(([key, label]) => (
              <label key={key}><input type="checkbox" checked={layers[key]} onChange={(e) => setLayers((current) => ({ ...current, [key]: e.target.checked }))} /> {label}</label>
            ))}
          </div>
          {incidents.isLoading || teams.isLoading || resources.isLoading || shelters.isLoading ? <Skeleton className="w-full h-[430px] rounded-none" /> : (
            <IncidentMap incidents={openIncidents} teams={teams.data ?? []} resources={resources.data ?? []} shelters={shelters.data ?? []}
              showIncidents={layers.incidents} showTeams={layers.teams} showShelters={layers.shelters} showResources={layers.supplies}
              onIncidentClick={(id) => navigate(`/incidents/${id}`)} height="430px" />
          )}
          <div className="command-map-legend">
            <span><i className="legend-dot legend-critical" /> Critical</span>
            <span><i className="legend-dot legend-high" /> High</span>
            {(['available', 'assigned', 'en_route'] as const).map((status) => <span key={status}><i className="legend-dot" style={{ background: TEAM_MARKER_COLORS[status] }} /> Team {TEAM_STATUS_LABELS[status].toLowerCase()}</span>)}
            <span><i className="legend-dot legend-shelter" /> Shelter</span>
            <span className="ml-auto">NOT FOR NAVIGATION</span>
          </div>
        </section>

        <section className="command-panel command-alerts-panel">
          <div className="command-panel-heading"><h2>Live alerts <span>{unackCount} UNACKNOWLEDGED</span></h2><Link className="command-link" to="/alerts">View all <ArrowUpRight size={14} /></Link></div>
          <div className="command-alert-tabs">
            <button className={alertTab === 'latest' ? 'active' : ''} onClick={() => setAlertTab('latest')}>Latest</button>
            <button className={alertTab === 'unack' ? 'active' : ''} onClick={() => setAlertTab('unack')}>Unacknowledged <b>{unackCount}</b></button>
            <button className={alertTab === 'ack' ? 'active' : ''} onClick={() => setAlertTab('ack')}>Acknowledged</button>
          </div>
          <div className="command-alert-list">
            {alerts.isLoading ? <div className="p-5"><Skeleton className="h-20 w-full mb-3" /><Skeleton className="h-20 w-full" /></div> : alertList.length > 0 ? alertList.slice(0, 5).map((alert) => (
              <div className="command-alert" key={alert.id}>
                <div className="command-alert-time">{timeAgo(alert.created_at)}<span className={`alert-dot alert-dot-${alert.severity}`} /></div>
                <div className="flex-1">
                  <div className="flex justify-between gap-2"><strong>{alert.message}</strong><PriorityBadge level={alert.severity} /></div>
                  <small>
                    {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                    {alert.incident_id && <> · <Link className="underline" to={`/incidents/${alert.incident_id}`}>{alert.incidents?.report_code ?? 'Incident'}</Link></>}
                    {alert.acknowledged && <> · acknowledged{alert.profiles ? ` by ${alert.profiles.full_name || alert.profiles.email}` : ''}</>}
                  </small>
                </div>
                {!alert.acknowledged && <button className="command-ack" onClick={() => handleAck(alert.id)}><Check size={12} /> Ack</button>}
              </div>
            )) : <EmptyState title="No alerts" message={alertTab === 'unack' ? 'Everything has been acknowledged' : 'No alerts to display'} />}
          </div>
        </section>
      </div>

      <div className="command-bottom-grid">
        <section className="command-panel">
          <div className="command-panel-heading"><h2>Team deployment <span>{teams.data?.length ?? 0} TEAMS</span></h2><Link className="command-link" to="/teams">Manage teams <ArrowUpRight size={14} /></Link></div>
          {supplyTypes.length > 0 && (
            <div className="command-resource-strip"><span>AVAILABLE / TOTAL</span>{supplyTypes.map(([type, counts]) => <span key={type}><Package size={14} /> {type.replace(/_/g, ' ')} <b>{counts.available} / {counts.total}</b></span>)}</div>
          )}
          {teams.data?.length ? (
            <div className="command-table-wrap"><table className="command-table"><thead><tr><th>Team</th><th>Assignment</th><th>Personnel</th><th>Status</th><th>Updated</th></tr></thead><tbody>
              {[...teams.data].sort((a, b) => Number(activeByTeam.has(b.id)) - Number(activeByTeam.has(a.id))).slice(0, 6).map((team) => {
                const active = activeByTeam.get(team.id);
                const incident = active ? incidentById.get(active.incident_id) : undefined;
                return <tr key={team.id}><td><strong>{team.team_code}</strong><span>{team.name}</span></td><td>{incident ? <Link className="underline" to={`/incidents/${incident.id}`}>{incident.report_code}{incident.area_landmark ? ` · ${incident.area_landmark}` : ''}</Link> : '—'}</td><td>{String(team.capacity).padStart(2, '0')}</td><td><span className={`command-status command-status-${team.status}`}>{TEAM_STATUS_LABELS[team.status]}</span></td><td>{timeAgo(team.updated_at)}</td></tr>;
              })}
            </tbody></table></div>
          ) : <EmptyState title="No teams yet" message="Add rescue teams on the Teams page." />}
        </section>

        <section className="command-panel command-shelter-panel">
          <div className="command-panel-heading"><h2>Shelter capacity <span>{openShelters.length} OPEN</span></h2><Link className="command-link" to="/shelters">Directory <ArrowUpRight size={14} /></Link></div>
          {openShelters.length ? <>
            <div className="command-shelter-total"><strong>{Math.max(0, shelterCapacity - shelterOccupancy)}</strong><span>spaces free</span><small>{shelterOccupancy} / {shelterCapacity}</small></div>
            {openShelters.slice(0, 4).map((shelter, index) => {
              const used = shelter.capacity ? Math.round((shelter.occupancy / shelter.capacity) * 100) : 100;
              return <div className="command-shelter-row" key={shelter.id}><span className="command-shelter-code">S{index + 1}</span><div className="flex-1"><div className="flex justify-between"><strong>{shelter.name}</strong><small>{shelter.occupancy} / {shelter.capacity}</small></div><div className="command-progress"><i style={{ width: `${Math.min(100, used)}%` }} /></div><small className="text-neutral-400">Updated {timeAgo(shelter.last_updated_at)}</small></div><b>{used}%</b></div>;
            })}
            {fullestShelter && fullestShelter.capacity > 0 && fullestShelter.occupancy / fullestShelter.capacity >= 0.9 && (
              <p className="command-shelter-warning">■ {fullestShelter.name} is {fullestShelter.status === 'full' ? 'full' : 'near capacity'}{roomiestShelter && roomiestShelter.id !== fullestShelter.id ? ` · most space at ${roomiestShelter.name}` : ''}</p>
            )}
          </> : <EmptyState title="No shelters recorded" message="Add shelters with capacity and facilities." />}
        </section>
      </div>

      <div className="command-source-line"><span>SOURCE · ResQNet database, live</span><span>{demo.data ? 'INCLUDES DEMO SCENARIO DATA · ' : ''}TIMES IN {tz}</span></div>
    </DashboardLayout>
  );
}
