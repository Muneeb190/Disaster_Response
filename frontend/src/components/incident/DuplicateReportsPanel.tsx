import { useState } from 'react';
import { Link2, MapPin, Split, Clock, ArrowRight, Files, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, ReasonDialog } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/States';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badges';
import { useToast } from '@/components/ui/toast-context';
import { useDismissDuplicateSuggestion, useDuplicateCandidates, useIncident, useLinkedReports, useLinkDuplicateReport, useUnlinkDuplicateReport } from '@/hooks/useData';
import type { Incident } from '@/types';
import { timeAgo } from '@/lib/utils';

export function DuplicateReportsPanel({ incident }: { incident: Incident }) {
  const { toast } = useToast();
  const candidates = useDuplicateCandidates(incident.id);
  const linked = useLinkedReports(incident.id);
  const primary = useIncident(incident.primary_incident_id ?? '');
  const linkReport = useLinkDuplicateReport();
  const unlinkReport = useUnlinkDuplicateReport();
  const dismissSuggestion = useDismissDuplicateSuggestion();
  const [confirmLink, setConfirmLink] = useState<{ id: string; code: string } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<{ id: string; code: string } | null>(null);
  const [dismissCandidate, setDismissCandidate] = useState<{ id: string; code: string } | null>(null);

  const combine = async () => {
    if (!confirmLink) return;
    try {
      await linkReport.mutateAsync({ sourceIncidentId: confirmLink.id, primaryIncidentId: incident.id });
      toast(`${confirmLink.code} combined into ${incident.report_code}`, 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not combine reports', 'error'); }
    finally { setConfirmLink(null); }
  };

  const separate = async () => {
    if (!confirmUnlink) return;
    try {
      await unlinkReport.mutateAsync(confirmUnlink.id);
      toast(`${confirmUnlink.code} separated into its own incident`, 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not separate report', 'error'); }
    finally { setConfirmUnlink(null); }
  };

  const dismiss = async (reason: string) => {
    if (!dismissCandidate) return;
    try {
      await dismissSuggestion.mutateAsync({ incidentId: incident.id, candidateId: dismissCandidate.id, reason });
      toast(`${dismissCandidate.code} rejected as a duplicate`, 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not reject suggestion', 'error'); }
    finally { setDismissCandidate(null); }
  };

  if (incident.primary_incident_id) {
    return <div className="card card-body border-blue-200 bg-blue-50">
      <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2"><Link2 size={15} /> Combined source report</h3>
      <p className="text-xs text-blue-700 mt-2">This original report is preserved and currently belongs to the main incident.</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {primary.data && <Link className="btn-secondary btn-sm" to={`/incidents/${primary.data.id}`}>Open {primary.data.report_code} <ArrowRight size={14} /></Link>}
        <button className="btn-secondary btn-sm" onClick={() => setConfirmUnlink({ id: incident.id, code: incident.report_code })} disabled={unlinkReport.isPending}><Split size={14} /> Separate report</button>
      </div>
      <ConfirmDialog open={!!confirmUnlink} onClose={() => setConfirmUnlink(null)} onConfirm={() => void separate()} title="Separate this report?" message="The original report will become an independent incident again. Its saved details will not be changed." confirmLabel="Separate" />
    </div>;
  }

  const suggestions = candidates.data ?? [];
  const sources = linked.data ?? [];
  return <div className="card overflow-hidden">
    <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2"><Files size={15} /> Duplicate reports</h3>
      {sources.length > 0 && <span className="badge-info text-[10px]">{sources.length + 1} reports combined</span>}
    </div>
    <div className="p-4 space-y-4">
      {sources.length > 0 && <section><p className="text-xs font-semibold text-neutral-600 mb-2">Combined source reports ({sources.length})</p><div className="space-y-2">
        {sources.map((source) => <div key={source.id} className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><Link to={`/incidents/${source.id}`} className="text-xs font-bold text-primary-700 hover:underline">{source.report_code}</Link><p className="text-xs text-neutral-600 mt-1 line-clamp-2">{source.description}</p></div><button className="btn-ghost btn-sm" onClick={() => setConfirmUnlink({ id: source.id, code: source.report_code })}><Split size={13} /> Separate</button></div>
          <p className="text-[10px] text-neutral-400 mt-2">Reported {timeAgo(source.created_at)}{source.area_landmark ? ` · ${source.area_landmark}` : ''}</p>
        </div>)}
      </div></section>}
      <section><p className="text-xs font-semibold text-neutral-600 mb-2">Possible duplicates</p>
        {candidates.isLoading ? <LoadingSpinner size={18} /> : suggestions.length ? <div className="space-y-2">{suggestions.map((candidate) => <div key={candidate.incident_id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Link to={`/incidents/${candidate.incident_id}`} className="text-xs font-bold text-primary-700 hover:underline">{candidate.report_code}</Link><span className="badge-warning text-[10px]">{candidate.score}% match</span><PriorityBadge level={candidate.priority_level} /><StatusBadge status={candidate.status} /></div>
            <p className="text-xs text-neutral-700 mt-2 line-clamp-2">{candidate.description}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-neutral-500"><span className="flex items-center gap-1"><MapPin size={11} /> {candidate.distance_m < 1000 ? `${candidate.distance_m} m` : `${(candidate.distance_m / 1000).toFixed(1)} km`} away</span><span className="flex items-center gap-1"><Clock size={11} /> {Math.round(candidate.time_difference_minutes / 60)}h apart</span><span>{Math.round(candidate.description_similarity * 100)}% text similarity</span></div>
          </div><div className="flex shrink-0 flex-col gap-2"><button className="btn-primary btn-sm" onClick={() => setConfirmLink({ id: candidate.incident_id, code: candidate.report_code })}><Link2 size={13} /> Combine here</button><button className="btn-secondary btn-sm" onClick={() => setDismissCandidate({ id: candidate.incident_id, code: candidate.report_code })}><X size={13} /> Not a duplicate</button></div></div>
        </div>)}</div> : <p className="text-xs text-neutral-400">No likely duplicates found within 1 km and 24 hours.</p>}
      </section>
    </div>
    <ConfirmDialog open={!!confirmLink} onClose={() => setConfirmLink(null)} onConfirm={() => void combine()} title="Combine these reports?" message={`${confirmLink?.code ?? 'This report'} will be linked to ${incident.report_code}. The original remains saved and can be separated later.`} confirmLabel="Combine reports" />
    <ConfirmDialog open={!!confirmUnlink} onClose={() => setConfirmUnlink(null)} onConfirm={() => void separate()} title="Separate this report?" message="The source report will become an independent incident again. Its original details remain unchanged." confirmLabel="Separate" />
    <ReasonDialog open={!!dismissCandidate} onClose={() => setDismissCandidate(null)} onConfirm={(reason) => void dismiss(reason)} title="Reject duplicate suggestion" message={`Explain why ${dismissCandidate?.code ?? 'this report'} describes a different emergency. This decision is kept in the audit history.`} confirmLabel="Reject suggestion" />
  </div>;
}
