import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Package, Activity, ArrowUpRight, Check, TriangleAlert, Truck, RadioTower, House, Layers3, Volume2, Maximize2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IncidentMap } from '@/components/map/IncidentMap';
import { PriorityBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useDashboardSummary, useIncidents, useTeams, useResources, useAlerts, useAuditLogs, useAcknowledgeAlert, useDangerZones } from '@/hooks/useData';
import { useToast } from '@/components/ui/toast-context';
import { timeAgo } from '@/lib/utils';
import { enableBrowserNotifications } from '@/lib/notifications';

export function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const summary = useDashboardSummary();
  const incidents = useIncidents({ limit: 10 });
  const teams = useTeams();
  const resources = useResources();
  const alerts = useAlerts();
  const dangerZones = useDangerZones();
  const auditLogs = useAuditLogs(undefined, undefined, 15);
  const ackAlert = useAcknowledgeAlert();
  const [showUnackOnly, setShowUnackOnly] = useState(false);

  const unackCount = alerts.data?.filter((a) => !a.acknowledged).length ?? 0;
  const filteredAlerts = showUnackOnly ? alerts.data?.filter((a) => !a.acknowledged) : alerts.data;
  const shelters = resources.data?.filter((resource) => resource.type === 'shelter') ?? [];
  const shelterTotal = shelters.reduce((sum, shelter) => sum + shelter.quantity_available + shelter.quantity_reserved, 0);
  const shelterAvailable = shelters.reduce((sum, shelter) => sum + shelter.quantity_available, 0);
  const deployedPersonnel = teams.data?.filter((team) => team.status === 'assigned').reduce((sum, team) => sum + team.capacity, 0) ?? 0;
  const nowPakistan = useMemo(() => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Karachi' }).format(new Date()), []);
  const topDangerZone = dangerZones.data?.find((zone) => zone.severity === 'critical') ?? dangerZones.data?.find((zone) => zone.severity === 'high');

  const handleAck = async (id: string) => {
    try {
      await ackAlert.mutateAsync(id);
      toast('Alert acknowledged', 'success');
    } catch {
      toast('Failed to acknowledge alert', 'error');
    }
  };

  const enableNotifications = async () => {
    try { await enableBrowserNotifications(); toast('Browser notifications enabled', 'success'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not enable notifications', 'error'); }
  };

  const kpis = [
    { label: 'Active incidents', value: summary.data?.openIncidents ?? 0, detail: `${summary.data?.criticalIncidents ?? 0} critical`, icon: TriangleAlert, tone: 'red', trend: 'Live from submitted reports' },
    { label: 'Personnel deployed', value: deployedPersonnel || summary.data?.availableTeams ? `${deployedPersonnel || 0}` : '0', detail: `of ${teams.data?.reduce((sum, team) => sum + team.capacity, 0) ?? 0} available`, icon: Users, tone: 'teal', trend: `${teams.data?.filter((team) => team.status === 'assigned').length ?? 0} teams in the field` },
    { label: 'Danger zones', value: dangerZones.data?.length ?? 0, detail: `${dangerZones.data?.filter((zone) => zone.severity === 'critical').length ?? 0} critical`, icon: Truck, tone: 'teal', trend: 'Generated from high-priority reports' },
    { label: 'Shelter occupancy', value: shelterTotal ? `${Math.round(((shelterTotal - shelterAvailable) / shelterTotal) * 100)}%` : '0%', detail: `${shelterTotal - shelterAvailable} / ${shelterTotal} beds`, icon: House, tone: 'amber', trend: `${shelterAvailable} beds available` },
  ];

  return (
    <DashboardLayout title="Response overview" subtitle="Operations / Islamabad, Pakistan" actions={<span className="command-live-pill"><span /> LIVE</span>}>
      <div className="command-page-head">
        <div>
          <p className="command-breadcrumb">OPERATIONS / ISLAMABAD, PAKISTAN</p>
          <div className="flex items-center gap-3"><h1>Response overview</h1><span className="command-live-pill"><span /> LIVE</span></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="command-time"><strong>{nowPakistan} PKT</strong><span>Live operational data</span></div>
          <button className="command-button command-button-light" onClick={() => void enableNotifications()}><Volume2 size={14} /> Browser alerts</button>
          <button className="command-button command-button-teal" onClick={() => navigate('/report')}><span className="text-lg leading-none">+</span> Log incident</button>
        </div>
      </div>

      {topDangerZone && <div className="command-advisory"><TriangleAlert size={16} /><strong>{topDangerZone.severity.toUpperCase()} danger zone</strong><span className="command-advisory-separator" /> {topDangerZone.name}. {topDangerZone.instructions ?? 'Avoid the marked area and follow coordinator instructions.'}<button onClick={() => topDangerZone.incident_id && navigate(`/incidents/${topDangerZone.incident_id}`)}>View incident <ArrowUpRight size={13} /></button></div>}

      <div className="command-kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return <div className="command-kpi" key={kpi.label}><div className={`command-kpi-icon command-kpi-icon-${kpi.tone}`}><Icon size={16} /></div><p>{kpi.label}</p><div className="flex items-baseline gap-2"><strong>{summary.isLoading ? <Skeleton className="w-14 h-8" /> : kpi.value}</strong><span className={`command-kpi-detail command-kpi-${kpi.tone}`}>{kpi.detail}</span></div><small>{kpi.trend}</small></div>;
        })}
      </div>

      <div className="command-workspace-grid">
        <section className="command-panel command-map-panel">
          <div className="command-panel-heading"><div><h2>Response map <span>{incidents.data?.length ?? 0} INCIDENTS IN VIEW</span></h2></div><span className="command-muted">Islamabad Capital Territory <Maximize2 size={14} /></span></div>
          <div className="command-map-controls"><span><input type="checkbox" defaultChecked /> Incidents</span><span><input type="checkbox" defaultChecked /> Danger zones</span><span><input type="checkbox" defaultChecked /> Teams</span><span><input type="checkbox" defaultChecked /> Shelters</span><span className="ml-auto command-map-layers"><Layers3 size={14} /> Map layers</span></div>
          {incidents.isLoading || teams.isLoading || resources.isLoading ? <Skeleton className="w-full h-[430px] rounded-none" /> : <IncidentMap incidents={incidents.data ?? []} teams={teams.data ?? []} resources={resources.data ?? []} dangerZones={dangerZones.data ?? []} onIncidentClick={(id) => navigate(`/incidents/${id}`)} height="430px" />}
          <div className="command-map-legend"><span><i className="legend-dot legend-critical" /> Critical incident</span><span><i className="legend-dot legend-high" /> High priority</span><span><i className="legend-dot legend-shelter" /> Shelter</span><span><i className="legend-zone" /> Danger zone</span><span className="ml-auto">LIVE MAP · ISLAMABAD</span></div>
        </section>

        <section className="command-panel command-alerts-panel">
          <div className="command-panel-heading"><h2>Live alerts <span>{alerts.data?.length ?? 0}</span></h2><button className="command-link">View all <ArrowUpRight size={14} /></button></div>
          <div className="command-alert-tabs"><button className={!showUnackOnly ? 'active' : ''} onClick={() => setShowUnackOnly(false)}>Latest</button><button className={showUnackOnly ? 'active' : ''} onClick={() => setShowUnackOnly(true)}>Unacknowledged <b>{unackCount}</b></button><button>Resolved</button></div>
          <div className="command-alert-list">
            {alerts.isLoading ? <div className="p-5"><Skeleton className="h-20 w-full mb-3" /><Skeleton className="h-20 w-full" /></div> : filteredAlerts && filteredAlerts.length > 0 ? filteredAlerts.slice(0, 5).map((alert) => <div className="command-alert" key={alert.id}><div className="command-alert-time">{timeAgo(alert.created_at)}<span className={`alert-dot alert-dot-${alert.severity}`} /></div><div className="flex-1"><div className="flex justify-between gap-2"><strong>{alert.message}</strong><PriorityBadge level={alert.severity} /></div><p>Response coordination update requiring attention.</p><small>FIELD REPORT · INC-{alert.id.slice(0, 3).toUpperCase()}</small></div>{!alert.acknowledged && <button className="command-ack" onClick={() => handleAck(alert.id)}><Check size={12} /> Ack</button>}</div>) : <EmptyState title="No alerts" message="No active alerts to display" />}
          </div>
          <div className="command-alert-footer"><span><Activity size={13} /> Updating every 30s</span><span><Volume2 size={13} /> Audio on</span></div>
        </section>
      </div>

      <div className="command-bottom-grid">
        <section className="command-panel">
          <div className="command-panel-heading"><h2>Team deployment <span>{teams.data?.length ?? 0} TEAMS</span></h2><button className="command-link" onClick={() => navigate('/teams')}>Manage resources <ArrowUpRight size={14} /></button></div>
          <div className="command-resource-strip"><span>LIVE TEAM STATUS</span><span><Truck size={14} /> Assigned <b>{teams.data?.filter((team) => team.status === 'assigned').length ?? 0}</b></span><span><RadioTower size={14} /> Available <b>{teams.data?.filter((team) => team.status === 'available').length ?? 0}</b></span><span><Package size={14} /> Personnel <b>{teams.data?.reduce((sum, team) => sum + team.capacity, 0) ?? 0}</b></span></div>
          <div className="command-table-wrap"><table className="command-table"><thead><tr><th>Team / agency</th><th>Assignment</th><th>Personnel</th><th>Status</th><th>Updated</th></tr></thead><tbody>{teams.data?.slice(0, 4).map((team) => <tr key={team.id}><td><strong>{team.team_code}</strong><span>{team.name}</span></td><td>{team.status === 'assigned' ? 'Assigned to active incident' : 'Available for dispatch'}</td><td>{String(team.capacity).padStart(2, '0')}</td><td><span className={`command-status command-status-${team.status}`}>{team.status === 'assigned' ? 'On scene' : team.status === 'available' ? 'Available' : 'Offline'}</span></td><td>{team.last_location_update ? timeAgo(team.last_location_update) : '—'}</td></tr>)}</tbody></table></div>
          <div className="command-panel-foot">Showing priority assignments of {teams.data?.length ?? 0} teams <span>■ {teams.data?.filter((team) => team.status === 'available').reduce((sum, team) => sum + team.capacity, 0) ?? 0} personnel available</span></div>
        </section>

        <section className="command-panel command-shelter-panel"><div className="command-panel-heading"><h2>Shelter capacity <span>{shelters.length} OPEN</span></h2><button className="command-link" onClick={() => navigate('/resources')}>Directory <ArrowUpRight size={14} /></button></div><div className="command-shelter-total"><strong>{shelterAvailable}</strong><span>beds available</span><small>{shelterTotal - shelterAvailable} / {shelterTotal}</small></div>{shelters.slice(0, 3).map((shelter, index) => { const capacity = shelter.quantity_available + shelter.quantity_reserved; const used = capacity ? Math.round((shelter.quantity_reserved / capacity) * 100) : 0; return <div className="command-shelter-row" key={shelter.id}><span className="command-shelter-code">S{index + 1}</span><div className="flex-1"><div className="flex justify-between"><strong>{shelter.name}</strong><small>{shelter.quantity_reserved} / {capacity}</small></div><div className="command-progress"><i style={{ width: `${used}%` }} /></div></div><b>{used}%</b></div>; })}{!shelters.length && <EmptyState title="No shelters registered" message="Add shelters from the resource directory." />}</section>
      </div>

      <div className="command-source-line"><span>SOURCES · ResQNet incident reports · Team updates · Shelter records</span><span>LIVE OPERATIONAL DATA / PAKISTAN STANDARD TIME</span></div>
      {auditLogs.data?.length ? <div className="sr-only">{auditLogs.data.length} recent activity records loaded</div> : null}
    </DashboardLayout>
  );
}
