import { useEffect, useState } from 'react';
import { Camera, Check, ShieldAlert, X } from 'lucide-react';
import { useIncidentEvidence, useReviewIncidentEvidence } from '@/hooks/useData';
import { signedEvidenceUrl } from '@/lib/evidence';
import { LoadingSpinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import type { IncidentEvidence } from '@/types';

export function IncidentEvidencePanel({ incidentId, legacyPhotoUrl }: { incidentId: string; legacyPhotoUrl?: string | null }) {
  const evidence = useIncidentEvidence(incidentId);
  const review = useReviewIncidentEvidence();
  const { toast } = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void Promise.all((evidence.data ?? []).map(async (item) => {
      try { return [item.id, await signedEvidenceUrl(item.storage_path)] as const; }
      catch { return [item.id, ''] as const; }
    })).then((entries) => { if (active) setUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [evidence.data]);

  const setReview = async (item: IncidentEvidence, status: 'verified' | 'disputed') => {
    try {
      await review.mutateAsync({ evidenceId: item.id, status, notes: notes[item.id] });
      toast(status === 'verified' ? 'Evidence verified' : 'Evidence marked disputed', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not review evidence', 'error'); }
  };

  if (evidence.isLoading) return <div className="card card-body"><LoadingSpinner size={18} /></div>;
  const items = evidence.data ?? [];
  if (!items.length && !legacyPhotoUrl) return null;

  return (
    <section className="card card-body">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-800"><Camera size={16} /> Private reporter evidence</h3>
      <p className="mb-4 text-xs text-neutral-500">Review the photo itself; a photo does not automatically verify every reported fact.</p>
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-neutral-200 p-3">
            {urls[item.id] ? (
              <img src={urls[item.id]} alt="Private evidence supplied by the reporter" className="max-h-96 w-full rounded-lg bg-neutral-50 object-contain" />
            ) : (
              <p className="rounded-lg bg-neutral-50 p-4 text-xs text-neutral-500">The private photo could not be opened. Refresh or check storage permissions.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className={item.review_status === 'verified' ? 'badge-success' : item.review_status === 'disputed' ? 'badge-error' : 'badge-warning'}>
                {item.review_status === 'pending' ? 'Awaiting review' : item.review_status}
              </span>
              <span className="text-xs text-neutral-400">{Math.ceil(item.size_bytes / 1024)} KB</span>
            </div>
            {item.review_status === 'pending' ? (
              <div className="mt-3">
                <input className="input text-sm" value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Review note (optional)" />
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary btn-sm" disabled={review.isPending} onClick={() => void setReview(item, 'verified')}><Check size={14} /> Verify evidence</button>
                  <button className="btn-secondary btn-sm text-red-700" disabled={review.isPending} onClick={() => void setReview(item, 'disputed')}><X size={14} /> Dispute</button>
                </div>
              </div>
            ) : item.review_notes ? <p className="mt-2 text-xs text-neutral-600">Review note: {item.review_notes}</p> : null}
          </article>
        ))}
        {!items.length && legacyPhotoUrl?.startsWith('http') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs text-amber-900"><ShieldAlert size={14} /> Legacy evidence link—privacy controls depend on its original storage.</p>
            <img src={legacyPhotoUrl} alt="Legacy incident evidence" className="max-h-96 w-full rounded-lg object-contain" />
          </div>
        )}
      </div>
    </section>
  );
}
