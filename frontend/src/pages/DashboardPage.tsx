import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Package, Activity, ArrowUpRight, Check, TriangleAlert, Download, Truck, RadioTower, House, Layers3, Volume2, Maximize2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IncidentMap } from '@/components/map/IncidentMap';
import { PriorityBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useDashboardSummary, useIncidents, useTeams, useResources, useAlerts, useAuditLogs, useAcknowledgeAlert } from '@/hooks/useData';
import { useToast } from '@/components/ui/toast-context';
import { timeAgo } from '@/lib/utils';

export function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const summary = useDashboardSummary();
  const incidents = useIncidents({ limit: 10 });
  const teams = useTeams();
  const resources = useResources();
  const alerts = useAlerts();
  const auditLogs = useAuditLogs(undefined, undefined, 15);
  const ackAlert = useAcknowledgeAlert();
  const [showUnackOnly, setShowUnackOnly] = useState(false);

  const unackCount = alerts.data?.filter((a) => !a.acknowledged).length ?? 0;
  const filteredAlerts = showUnackOnly ? alerts.data?.filter((a) => !a.acknowledged) : alerts.data;
  const shelters = resources.data?.filter((resource) => resource.type === 'shelter') ?? [];
  const shelterTotal = shelters.reduce((sum, shelter) => sum + shelter.quantity_available + shelter.quantity_reserved, 0);
  const shelterAvailable = shelters.reduce((sum, shelter) => sum + shelter.quantity_available, 0);
  const deployedPersonnel = teams.data?.filter((team) => team.status === 'assigned').reduce((sum, team) => sum + team.capacity, 0) ?? 0;

  const handleAck = async (id: string) => {
    try {
      await ackAlert.mutateAsync(id);
      toast('Alert acknowledged', 'success');
    } catch {
      toast('Failed to acknowledge alert', 'error');
    }
  };

  const kpis = [
    { label: 'Active incidents', value: summary.data?.openIncidents ?? 0, detail: `${summary.data?.criticalIncidents ?? 0} critical`, icon: TriangleAlert, tone: 'red', trend: '+2 in the last hour' },
    { label: 'Personnel deployed', value: deployedPersonnel || summary.data?.availableTeams ? `${deployedPersonnel || 0}` : '0', detail: `of ${teams.data?.reduce((sum, team) => sum + team.capacity, 0) ?? 0} available`, icon: Users, tone: 'teal', trend: `${teams.data?.filter((team) => team.status === 'assigned').length ?? 0} teams in the field` },
    { label: 'Residents evacuated', value: '2,460', detail: 'estimated', icon: Truck, tone: 'teal', trend: '↑ 320 since 12:00' },
    { label: 'Shelter occupancy', value: shelterTotal ? `${Math.round(((shelterTotal - shelterAvailable) / shelterTotal) * 100)}%` : '74%', detail: `${shelterTotal - shelterAvailable || 1110} / ${shelterTotal || 1500} beds`, icon: House, tone: 'amber', trend: `${shelterAvailable || 390} beds available` },
  ];

  return (
    <DashboardLayout title="Response overview" subtitle="Operations / Sacramento County, CA" actions={<span className="command-live-pill"><span /> LIVE</span>}>
      <div className="command-page-head">
        <div>
          <p className="command-breadcrumb">OPERATIONS / SACRAMENTO COUNTY, CA</p>
          <div className="flex items-center gap-3"><h1>Response overview</h1><span className="command-live-pill"><span /> LIVE</span></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="command-time"><strong>17 OCT 2026 · 14:32:08 PDT</strong><span>Last synced 6 seconds ago</span></div>
          <button className="command-button command-button-light"><Download size={14} /> Situation report</button>
          <button className="command-button command-button-teal" onClick={() => navigate('/report')}><span className="text-lg leading-none">+</span> Log incident</button>
        </div>
      </div>

      <div className="command-advisory"><TriangleAlert size={16} /><strong>Flood warning in effect</strong><span className="command-advisory-separator" /> Sacramento River at 28.4 ft, rising 0.3 ft/hr. Evacuation orders active in zones A1 and A2.<button>View advisory <ArrowUpRight size={13} /></button></div>

      <div className="command-kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return <div className="command-kpi" key={kpi.label}><div className={`command-kpi-icon command-kpi-icon-${kpi.tone}`}><Icon size={16} /></div><p>{kpi.label}</p><div className="flex items-baseline gap-2"><strong>{summary.isLoading ? <Skeleton className="w-14 h-8" /> : kpi.value}</strong><span className={`command-kpi-detail command-kpi-${kpi.tone}`}>{kpi.detail}</span></div><small>{kpi.trend}</small></div>;
        })}
      </div>

      <div className="command-workspace-grid">
        <section className="command-panel command-map-panel">
          <div className="command-panel-heading"><div><h2>Response map <span>{incidents.data?.length ?? 0} OF 12 INCIDENTS IN VIEW</span></h2></div><span className="command-muted">Sacramento metro <Maximize2 size={14} /></span></div>
          <div className="command-map-controls"><span><input type="checkbox" defaultChecked /> Incidents</span><span><input type="checkbox" defaultChecked /> Evacuation zones</span><span><input type="checkbox" defaultChecked /> Teams</span><span><input type="checkbox" defaultChecked /> Shelters</span><span className="ml-auto command-map-layers"><Layers3 size={14} /> Map layers</span></div>
          {incidents.isLoading || teams.isLoading || resources.isLoading ? <Skeleton className="w-full h-[430px] rounded-none" /> : <IncidentMap incidents={incidents.data ?? []} teams={teams.data ?? []} resources={resources.data ?? []} onIncidentClick={(id) => navigate(`/incidents/${id}`)} height="430px" />}
          <div className="command-map-legend"><span><i className="legend-dot legend-critical" /> Critical incident</span><span><i className="legend-dot legend-high" /> High priority</span><span><i className="legend-dot legend-shelter" /> Shelter</span><span><i className="legend-zone" /> Evacuation order</span><span className="ml-auto">SCHEMATIC · NOT FOR NAVIGATION</span></div>
        </section>

        <section className="command-panel command-alerts-panel">
          <div className="command-panel-heading"><h2>Live alerts <span>08</span></h2><button className="command-link">View all <ArrowUpRight size={14} /></button></div>
          <div className="command-alert-tabs"><button className={!showUnackOnly ? 'active' : ''} onClick={() => setShowUnackOnly(false)}>Latest</button><button className={showUnackOnly ? 'active' : ''} onClick={() => setShowUnackOnly(true)}>Unacknowledged <b>{unackCount}</b></button><button>Resolved</button></div>
          <div className="command-alert-list">
            {alerts.isLoading ? <div className="p-5"><Skeleton className="h-20 w-full mb-3" /><Skeleton className="h-20 w-full" /></div> : filteredAlerts && filteredAlerts.length > 0 ? filteredAlerts.slice(0, 5).map((alert) => <div className="command-alert" key={alert.id}><div className="command-alert-time">{timeAgo(alert.created_at)}<span className={`alert-dot alert-dot-${alert.severity}`} /></div><div className="flex-1"><div className="flex justify-between gap-2"><strong>{alert.message}</strong><PriorityBadge level={alert.severity} /></div><p>Response coordination update requiring attention.</p><small>FIELD REPORT · INC-{alert.id.slice(0, 3).toUpperCase()}</small></div>{!alert.acknowledged && <button className="command-ack" onClick={() => handleAck(alert.id)}><Check size={12} /> Ack</button>}</div>) : <EmptyState title="No alerts" message="No active alerts to display" />}
          </div>
          <div className="command-alert-footer"><span><Activity size={13} /> Updating every 30s</span><span><Volume2 size={13} /> Audio on</span></div>
        </section>
      </div>

      <div className="command-bottom-grid">
        <section className="command-panel">
          <div className="command-panel-heading"><h2>Team deployment <span>{teams.data?.length ?? 24} TEAMS</span></h2><button className="command-link" onClick={() => navigate('/teams')}>Manage resources <ArrowUpRight size={14} /></button></div>
          <div className="command-resource-strip"><span>DEPLOYED / TOTAL</span><span><Truck size={14} /> Vehicles <b>18 / 24</b></span><span><RadioTower size={14} /> Rescue boats <b>6 / 8</b></span><span><Package size={14} /> Medical kits <b>9 / 12</b></span></div>
          <div className="command-table-wrap"><table className="command-table"><thead><tr><th>Team / agency</th><th>Assignment</th><th>Personnel</th><th>Status</th><th>Updated</th></tr></thead><tbody>{teams.data?.slice(0, 4).map((team) => <tr key={team.id}><td><strong>{team.team_code}</strong><span>{team.name}</span></td><td>{team.status === 'assigned' ? 'INC-042 · Riverfront water rescue' : 'Available for dispatch'}</td><td>{String(team.capacity).padStart(2, '0')}</td><td><span className={`command-status command-status-${team.status}`}>{team.status === 'assigned' ? 'On scene' : team.status === 'available' ? 'Available' : 'Offline'}</span></td><td>{team.last_location_update ? timeAgo(team.last_location_update) : '—'}</td></tr>)}</tbody></table></div>
          <div className="command-panel-foot">Showing priority assignments of {teams.data?.length ?? 24} deployed teams <span>■ 32 personnel available</span></div>
        </section>

        <section className="command-panel command-shelter-panel"><div className="command-panel-heading"><h2>Shelter capacity <span>{shelters.length || 3} OPEN</span></h2><button className="command-link" onClick={() => navigate('/resources')}>Directory <ArrowUpRight size={14} /></button></div><div className="command-shelter-total"><strong>{shelterAvailable || 390}</strong><span>beds available</span><small>{shelterTotal - shelterAvailable || 1110} / {shelterTotal || 1500}</small></div>{(shelters.length ? shelters : [{ id: 's1', name: 'River City High', quantity_available: 50, quantity_reserved: 450, low_stock_threshold: 50 }, { id: 's2', name: 'Convention Center', quantity_available: 220, quantity_reserved: 380, low_stock_threshold: 50 }, { id: 's3', name: 'Grant High School', quantity_available: 120, quantity_reserved: 280, low_stock_threshold: 50 }]).slice(0, 3).map((shelter, index) => { const capacity = shelter.quantity_available + shelter.quantity_reserved; const used = Math.round((shelter.quantity_reserved / capacity) * 100); return <div className="command-shelter-row" key={shelter.id}><span className="command-shelter-code">S{index + 1}</span><div className="flex-1"><div className="flex justify-between"><strong>{shelter.name}</strong><small>{shelter.quantity_reserved} / {capacity}</small></div><div className="command-progress"><i style={{ width: `${used}%` }} /></div></div><b>{used}%</b></div>; })}<p className="command-shelter-warning">■ S1 near capacity · Direct new arrivals to S2</p></section>
      </div>

      <div className="command-source-line"><span>SOURCES · County EOC / CAD · USGS river gauge · Shelter field reports</span><span>ILLUSTRATIVE OPERATIONAL DATA / ALL TIMES PDT</span></div>
      {auditLogs.data?.length ? <div className="sr-only">{auditLogs.data.length} recent activity records loaded</div> : null}
    </DashboardLayout>
  );
}
