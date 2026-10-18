import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Filter, ShieldAlert, Eye } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DemoBadge, PriorityBadge, StatusBadge, VerificationBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { PriorityGauge } from '@/components/ui/PriorityGauge';
import { useIncidents } from '@/hooks/useData';
import { ConfidenceBadge, UrgentCheckBadge } from '@/components/incident/PriorityPanels';
import { topReasons } from '@/lib/triage';
import { INCIDENT_TYPE_LABELS, type IncidentType, type IncidentStatus, type PriorityLevel, type VerificationStatus } from '@/types';
import { timeAgo } from '@/lib/utils';

export function IncidentsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(params.get('type') ?? '');
  const [priorityFilter, setPriorityFilter] = useState<string>(params.get('priority') ?? '');
  const [statusFilter, setStatusFilter] = useState<string>(params.get('status') ?? '');
  const [verificationFilter, setVerificationFilter] = useState<string>(params.get('verification') ?? '');
  const [areaFilter, setAreaFilter] = useState<string>(params.get('area') ?? '');
  const [openOnly, setOpenOnly] = useState(params.get('open') !== '0');
  const [sort, setSort] = useState<'priority' | 'newest' | 'waiting'>('priority');
  const [includeLinked, setIncludeLinked] = useState(false);
  const [originFilter, setOriginFilter] = useState('');

  const incidents = useIncidents({
    type: (typeFilter || undefined) as IncidentType | undefined,
    priority: (priorityFilter || undefined) as PriorityLevel | undefined,
    status: (statusFilter || undefined) as IncidentStatus | undefined,
    verification: (verificationFilter || undefined) as VerificationStatus | undefined,
    limit: 1000,
    includeLinked,
  });

  const isOpen = (status: IncidentStatus) => !['resolved', 'cancelled'].includes(status);
  const areas = useMemo(() => [...new Set((incidents.data ?? []).map((i) => i.area_landmark?.trim()).filter((a): a is string => !!a))].sort(), [incidents.data]);

  // Serious but uncertain reports stay pinned at the top whatever filters are set (feature 14 rule).
  const urgentLane = (incidents.data ?? []).filter((inc) => inc.needs_urgent_check && isOpen(inc.status));
  // Feature 68: welfare checks nobody reported get their own lane, so they are never buried under public reports.
  const welfareLane = originFilter ? [] : (incidents.data ?? []).filter((inc) => inc.incident_origin === 'proactive_check' && isOpen(inc.status) && !urgentLane.includes(inc));

  const filtered = (incidents.data ?? []).filter((inc) => {
    if (openOnly && !statusFilter && !isOpen(inc.status)) return false;
    if (areaFilter && inc.area_landmark?.trim() !== areaFilter) return false;
    if (originFilter && inc.incident_origin !== originFilter) return false;
    if (urgentLane.includes(inc) || welfareLane.includes(inc)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inc.report_code.toLowerCase().includes(q) ||
      inc.description.toLowerCase().includes(q) ||
      (inc.area_landmark?.toLowerCase().includes(q) ?? false)
    );
  }).sort((a, b) => sort === 'priority' ? 0 : sort === 'newest' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at));

  return (
    <DashboardLayout title="Incidents" subtitle="Every report and welfare check, most urgent first.">
      {/* Filters */}
      <div className="card card-body mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="input pl-9"
              placeholder="Search by report code, description, or area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="select w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="flood">Flood</option>
            <option value="fire">Fire</option>
            <option value="medical_emergency">Medical Emergency</option>
            <option value="heatwave">Heatwave</option>
            <option value="other">Other</option>
          </select>
          <select className="select w-auto" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
          <select className="select w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="reported">Reported</option>
            <option value="verified">Verified</option>
            <option value="assigned">Assigned</option>
            <option value="dispatched">Dispatched</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="select w-auto" value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value)}>
            <option value="">All Verifications</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="disputed">Disputed</option>
            <option value="flagged">Flagged</option>
          </select>
          <select className="select w-auto" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">All Areas</option>
            {areas.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
          <select className="select w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="priority">Highest priority first</option>
            <option value="waiting">Waiting longest first</option>
            <option value="newest">Newest first</option>
          </select>
          <select className="select w-auto" value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}><option value="">All origins</option><option value="public_report">Public reports</option><option value="proactive_check">Proactive welfare checks</option></select>
          <label className="text-xs text-neutral-600 flex items-center gap-1.5"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
          <label className="flex items-center gap-2 text-xs text-neutral-600 whitespace-nowrap">
            <input type="checkbox" checked={includeLinked} onChange={(e) => setIncludeLinked(e.target.checked)} />
            Show combined source reports
          </label>
          {(typeFilter || priorityFilter || statusFilter || verificationFilter || areaFilter || originFilter || search || includeLinked) && (
            <button
              className="btn-ghost btn-sm"
              onClick={() => { setTypeFilter(''); setPriorityFilter(''); setStatusFilter(''); setVerificationFilter(''); setAreaFilter(''); setOriginFilter(''); setSearch(''); setIncludeLinked(false); }}
            >
              <Filter size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {urgentLane.length > 0 && (
        <div className="card mb-4 overflow-hidden border-critical/40">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#F0C2BC] bg-[#FBE4E1] px-5 py-3">
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-critical"><ShieldAlert size={18} aria-hidden="true" />Check these first ({urgentLane.length})</span>
            <span className="text-sm text-ink">Serious but uncertain. Always shown, whatever the filters.</span>
          </div>
          <div className="divide-y divide-line">
            {urgentLane.map((inc) => (
              <button key={inc.id} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-start hover:bg-neutral-50" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <PriorityGauge score={inc.priority_score} level={inc.priority_level} size="sm" showLabel={false} />
                <strong className="font-display text-lg">{inc.report_code}</strong>
                <PriorityBadge level={inc.priority_level} />
                <ConfidenceBadge level={inc.confidence_level ?? 'low'} score={inc.confidence_score} />
                <span className="text-sm text-neutral-600">{INCIDENT_TYPE_LABELS[inc.type]}{inc.area_landmark ? `, ${inc.area_landmark}` : ''}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">{topReasons(inc.risk_factors).join('; ')}</span>
                {inc.is_demo && <DemoBadge />}
                <span className="text-sm text-neutral-500">{timeAgo(inc.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {welfareLane.length > 0 && (
        <div className="card mb-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-primary-50 px-5 py-3">
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-primary-800"><Eye size={18} aria-hidden="true" />Welfare checks ({welfareLane.length})</span>
            <span className="text-sm text-ink">Nobody reported these. They come from silent zones and unanswered "Are you safe?" checks.</span>
          </div>
          <div className="divide-y divide-line">
            {welfareLane.map((inc) => (
              <button key={inc.id} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-start hover:bg-neutral-50" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <PriorityGauge score={inc.priority_score} level={inc.priority_level} size="sm" showLabel={false} />
                <strong className="font-display text-lg">{inc.report_code}</strong>
                <PriorityBadge level={inc.priority_level} />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-600">{inc.description}</span>
                <span className="text-sm text-neutral-500">{timeAgo(inc.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="card overflow-hidden">
        {incidents.isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Report</th>
                  <th>Why</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Checked</th>
                  <th>People</th>
                  <th>Area</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc) => (
                  <tr key={inc.id} className="cursor-pointer transition-colors hover:bg-neutral-50" onClick={() => navigate(`/incidents/${inc.id}`)}>
                    <td><PriorityGauge score={inc.priority_score} level={inc.priority_level} size="sm" /></td>
                    <td>
                      <Link to={`/incidents/${inc.id}`} className="font-display text-lg font-bold hover:underline" onClick={(event) => event.stopPropagation()}>{inc.report_code}</Link>
                      <span className="block text-sm text-neutral-500">{INCIDENT_TYPE_LABELS[inc.type]}</span>
                      {inc.primary_incident_id && <span className="block text-sm text-primary-700">Combined into another report</span>}
                      {inc.is_proxy_report && <span className="block text-sm text-neutral-500">Reported for someone else</span>}
                    </td>
                    <td className="max-w-[280px] text-sm text-neutral-600">{topReasons(inc.risk_factors).join('; ') || 'No risk factors yet'}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <ConfidenceBadge level={inc.confidence_level ?? 'low'} />
                        {inc.needs_urgent_check && <UrgentCheckBadge />}
                      </div>
                    </td>
                    <td><StatusBadge status={inc.status} /></td>
                    <td><VerificationBadge status={inc.verification_status} /></td>
                    <td>{inc.people_affected}</td>
                    <td className="max-w-[160px] truncate text-neutral-600">{inc.area_landmark || 'Not given'}</td>
                    <td className="whitespace-nowrap text-neutral-500">{timeAgo(inc.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Search size={28} />} title={incidents.data?.length ? 'Nothing matches these filters' : 'No incidents yet'} message={incidents.data?.length ? 'Clear a filter or change the search.' : 'Public reports and welfare checks appear here as they come in.'} />
        )}
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        Showing {filtered.length + urgentLane.length + welfareLane.length} of {incidents.data?.length ?? 0} incidents{urgentLane.length ? `, ${urgentLane.length} to check first` : ''}{welfareLane.length ? `, ${welfareLane.length} welfare checks` : ''}.
      </p>
    </DashboardLayout>
  );
}
