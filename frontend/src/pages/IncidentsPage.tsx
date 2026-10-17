import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PriorityBadge, StatusBadge, VerificationBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useIncidents } from '@/hooks/useData';
import { ConfidenceBadge, UrgentCheckBadge } from '@/components/incident/PriorityPanels';
import { topReasons } from '@/lib/triage';
import { INCIDENT_TYPE_LABELS, type IncidentType, type IncidentStatus, type PriorityLevel, type VerificationStatus } from '@/types';
import { timeAgo } from '@/lib/utils';

export function IncidentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [verificationFilter, setVerificationFilter] = useState<string>('');

  const incidents = useIncidents({
    type: (typeFilter || undefined) as IncidentType | undefined,
    priority: (priorityFilter || undefined) as PriorityLevel | undefined,
    status: (statusFilter || undefined) as IncidentStatus | undefined,
    verification: (verificationFilter || undefined) as VerificationStatus | undefined,
    limit: 100,
  });

  const filtered = (incidents.data ?? []).filter((inc) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inc.report_code.toLowerCase().includes(q) ||
      inc.description.toLowerCase().includes(q) ||
      (inc.area_landmark?.toLowerCase().includes(q) ?? false)
    );
  });

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
          {(typeFilter || priorityFilter || statusFilter || verificationFilter || search) && (
            <button
              className="btn-ghost btn-sm"
              onClick={() => { setTypeFilter(''); setPriorityFilter(''); setStatusFilter(''); setVerificationFilter(''); setSearch(''); }}
            >
              <Filter size={14} /> Clear
            </button>
          )}
        </div>
      </div>

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
                <tr className="text-left text-xs text-neutral-500 uppercase tracking-wide">
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
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{INCIDENT_TYPE_LABELS[inc.type]}</td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge level={inc.priority_level} />
                        <span className="text-xs text-neutral-400">{inc.priority_score}</span>
                      </div>
                      {topReasons(inc.risk_factors).length > 0 && (
                        <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{topReasons(inc.risk_factors).join(' · ')}</p>
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
        Showing {filtered.length} of {incidents.data?.length ?? 0} incidents
      </p>
    </DashboardLayout>
  );
}
