import { useState } from 'react';
import { Printer, Save, FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DemoBadge, PriorityBadge } from '@/components/ui/Badges';
import { Skeleton, ErrorState, LoadingSpinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useSituationSummary, useSaveSituationReport, useSituationReports } from '@/hooks/useData';
import { useOperationArea, localTimeZoneLabel } from '@/lib/region';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { INCIDENT_TYPE_LABELS, STATUS_LABELS, TEAM_STATUS_LABELS, type TeamStatus } from '@/types';

const PERIODS = [6, 12, 24, 72];

// Generated only from database facts; a coordinator reviews and adds notes before it is saved or shared.
export function SituationReportPage() {
  const { toast } = useToast();
  const area = useOperationArea();
  const [hours, setHours] = useState(12);
  const [notes, setNotes] = useState('');
  const summary = useSituationSummary(hours);
  const saved = useSituationReports();
  const save = useSaveSituationReport();
  const facts = summary.data;

  const saveReport = async () => {
    try {
      await save.mutateAsync({ hours, notes });
      toast('Situation report reviewed and saved', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to save report', 'error'); }
  };

  return (
    <DashboardLayout title="Situation report" subtitle="Generated from live records, reviewed before sharing">
      <div className="no-print card card-body mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-600">Period:</span>
        {PERIODS.map((p) => <button key={p} className={hours === p ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setHours(p)}>Last {p}h</button>)}
        <button className="btn-secondary btn-sm ml-auto" onClick={() => summary.refetch()}>Regenerate</button>
        <button className="btn-secondary btn-sm" disabled={!facts} onClick={() => window.print()}><Printer size={14} /> Print</button>
        <button className="btn-primary btn-sm" disabled={!facts || save.isPending} onClick={() => void saveReport()}>{save.isPending ? <LoadingSpinner size={14} /> : <Save size={14} />} Mark reviewed &amp; save</button>
      </div>

      {summary.isLoading ? <Skeleton className="h-96 w-full" /> : summary.error || !facts ? (
        <ErrorState message={summary.error instanceof Error ? summary.error.message : 'Could not generate the report'} onRetry={() => summary.refetch()} />
      ) : (
        <article className="card card-body space-y-6 print-report">
          <header className="border-b border-neutral-200 pb-4">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-neutral-900">Situation report · {area}</h1>{facts.contains_demo_data && <DemoBadge />}</div>
            <p className="text-xs text-neutral-500 mt-1">Generated {formatDateTime(facts.generated_at)} {localTimeZoneLabel()} from ResQNet records · covers the last {facts.period_hours} hours · automatically generated, check before acting on it</p>
          </header>

          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['Open incidents', facts.incidents.open],
              ['Critical open', facts.incidents.critical_open],
              ['No team yet', facts.incidents.unassigned_open],
              ['Not yet verified', facts.incidents.unverified_open],
              ['Need urgent check', facts.incidents.urgent_check_open ?? 0],
              [`Reported (${facts.period_hours}h)`, facts.incidents.reported_in_period],
              [`Resolved (${facts.period_hours}h)`, facts.incidents.resolved_in_period],
              ['Active assignments', facts.active_assignments],
              ['Unacknowledged alerts', facts.alerts_unacknowledged],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-200 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="text-2xl font-bold text-neutral-900">{value}</p></div>)}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-800 mb-2">Most urgent open incidents</h2>
            {facts.urgent.length ? (
              <table className="w-full text-xs">
                <thead className="text-left text-neutral-500"><tr><th className="py-1">Code</th><th>Type</th><th>Area</th><th>Priority</th><th>Status</th><th>Reported</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {facts.urgent.map((i) => (
                    <tr key={i.report_code}><td className="py-1.5 font-mono">{i.report_code}</td><td>{INCIDENT_TYPE_LABELS[i.type]}</td><td>{i.area_landmark || '—'}</td><td><PriorityBadge level={i.priority_level} /> {i.priority_score}{i.life_threatening ? ' · danger to life' : ''}</td><td>{STATUS_LABELS[i.status]}{i.verification_status === 'pending' ? ' · unverified' : ''}{i.needs_urgent_check ? ' · urgent check' : ''}</td><td>{timeAgo(i.created_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-xs text-neutral-500">No open critical or high-priority incidents.</p>}
          </section>

          <section className="grid sm:grid-cols-3 gap-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-800 mb-2">Teams</h2>
              {Object.keys(facts.teams).length ? <ul className="text-xs space-y-1">{(Object.entries(facts.teams) as [TeamStatus, number][]).map(([status, count]) => <li key={status}>{TEAM_STATUS_LABELS[status] ?? status}: <strong>{count}</strong></li>)}</ul> : <p className="text-xs text-neutral-500">No teams recorded.</p>}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-800 mb-2">Shortages</h2>
              {facts.shortages.length ? <ul className="text-xs space-y-1">{facts.shortages.map((s) => <li key={s.name}>{s.name}: <strong>{s.available}</strong> left (warn at {s.threshold})</li>)}</ul> : <p className="text-xs text-neutral-500">No item below its threshold.</p>}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-800 mb-2">Shelters</h2>
              <p className="text-xs">{facts.shelters.open} open · {facts.shelters.full} full</p>
              <p className="text-xs">{Math.max(0, facts.shelters.capacity - facts.shelters.occupancy)} of {facts.shelters.capacity} spaces free</p>
              {facts.shelters.stale > 0 && <p className="text-xs text-amber-700">{facts.shelters.stale} not updated in 6+ hours</p>}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-800 mb-2">Recent changes</h2>
            {facts.recent_changes.length ? (
              <ul className="text-xs space-y-1">
                {facts.recent_changes.map((c, index) => (
                  <li key={index}><span className="font-mono">{c.report_code}</span> · {c.event_type.replace(/_/g, ' ')}{c.from_value || c.to_value ? `: ${c.from_value ?? ''}${c.from_value && c.to_value ? ' → ' : ''}${c.to_value ?? ''}` : ''}{c.reason ? ` — “${c.reason}”` : ''} <span className="text-neutral-400">({timeAgo(c.created_at)})</span></li>
                ))}
              </ul>
            ) : <p className="text-xs text-neutral-500">No changes in this period.</p>}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-800 mb-2">Coordinator notes</h2>
            <textarea className="input resize-none no-print" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, decisions and priorities for the next shift" />
            <p className="hidden print-only text-xs whitespace-pre-wrap">{notes || 'No notes.'}</p>
          </section>
        </article>
      )}

      <section className="no-print mt-6">
        <h2 className="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2"><FileText size={14} /> Saved reports</h2>
        {saved.data?.length ? (
          <ul className="card divide-y divide-neutral-100 text-xs">
            {saved.data.map((r) => <li key={r.id} className="p-3 flex justify-between gap-3"><span>Last {r.period_hours}h · reviewed by {r.profiles?.full_name || r.profiles?.email || 'unknown'}{r.notes ? ` — ${r.notes}` : ''}</span><span className="text-neutral-400 whitespace-nowrap">{formatDateTime(r.created_at)}</span></li>)}
          </ul>
        ) : <p className="text-xs text-neutral-400">No saved reports yet.</p>}
      </section>
    </DashboardLayout>
  );
}
