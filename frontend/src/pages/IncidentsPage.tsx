import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Filter, ArrowRight, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DemoBadge, PriorityBadge, StatusBadge, VerificationBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
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

  const filtered = (incidents.data ?? []).filter((inc) => {
    if (openOnly && !statusFilter && !isOpen(inc.status)) return false;
    if (areaFilter && inc.area_landmark?.trim() !== areaFilter) return false;
    if (originFilter && inc.incident_origin !== originFilter) return false;
    if (urgentLane.includes(inc)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inc.report_code.toLowerCase().includes(q) ||
      inc.description.toLowerCase().includes(q) ||
      (inc.area_landmark?.toLowerCase().includes(q) ?? false)
    );
  }).sort((a, b) => sort === 'priority' ? 0 : sort === 'newest' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at));

  return (
    <DashboardLayout title="Incidents" subtitle="Search and filter all emergency reports">
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
        <div className="card mb-4 border-red-200">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 rounded-t-xl flex items-center gap-2 text-sm font-semibold text-red-800">
            <ShieldAlert size={16} /> Urgent verification ({urgentLane.length})
            <span className="font-normal text-xs text-red-700">Serious but uncertain — check these first. Always shown, whatever the filters.</span>
          </div>
          <div className="divide-y divide-red-50">
            {urgentLane.map((inc) => (
              <button key={inc.id} className="w-full text-left px-4 py-3 hover:bg-red-50/50 flex flex-wrap items-center gap-3 text-sm" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <code className="text-xs font-bold text-primary-700">{inc.report_code}</code>
                <PriorityBadge level={inc.priority_level} />
                <ConfidenceBadge level={inc.confidence_level ?? 'low'} score={inc.confidence_score} />
                <span className="text-xs text-neutral-600">{INCIDENT_TYPE_LABELS[inc.type]}{inc.area_landmark ? ` · ${inc.area_landmark}` : ''}</span>
                <span className="text-xs text-neutral-500 truncate flex-1">{topReasons(inc.risk_factors).join(' · ')}</span>
                {inc.is_demo && <DemoBadge />}
                <span className="text-xs text-neutral-400">{timeAgo(inc.created_at)}</span>
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
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">Report Code</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Priority &amp; why</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">People</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((inc) => (
                  <tr key={inc.id} className="hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => navigate(`/incidents/${inc.id}`)}>
                    <td className="px-4 py-3">
                      <code className="text-xs font-bold text-primary-700">{inc.report_code}</code>
                      {inc.primary_incident_id && <span className="block text-xs text-blue-600 mt-0.5">Combined source</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{INCIDENT_TYPE_LABELS[inc.type]}</td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge level={inc.priority_level} />
                        <span className="text-xs text-neutral-400">{inc.priority_score}</span>
                      </div>
                      {topReasons(inc.risk_factors).length > 0 && (
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">{topReasons(inc.risk_factors).join(' · ')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ConfidenceBadge level={inc.confidence_level ?? 'low'} />
                        {inc.needs_urgent_check && <UrgentCheckBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                    <td className="px-4 py-3"><VerificationBadge status={inc.verification_status} /></td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{inc.people_affected}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500 max-w-[160px] truncate">{inc.area_landmark || '—'}</td>
                    <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">{timeAgo(inc.created_at)}</td>
                    <td className="px-4 py-3"><ArrowRight size={14} className="text-neutral-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Search size={40} />} title="No incidents found" message="Try adjusting your filters or search query." />
        )}
      </div>

      <p className="text-xs text-neutral-400 mt-3">
        Showing {filtered.length + urgentLane.length} of {incidents.data?.length ?? 0} incidents{urgentLane.length ? ` (${urgentLane.length} in urgent verification)` : ''}
      </p>
    </DashboardLayout>
  );
}
