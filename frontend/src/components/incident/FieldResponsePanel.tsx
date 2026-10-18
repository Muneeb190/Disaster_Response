import { AlertTriangle, CheckCircle2, LifeBuoy, MapPin, PackageCheck, Users } from 'lucide-react';
import { useBackupRequestsForIncident, useCompletionReportsForIncident, useResources } from '@/hooks/useData';
import { formatDateTime } from '@/lib/utils';

export function FieldResponsePanel({ incidentId }: { incidentId: string }) {
  const backup = useBackupRequestsForIncident(incidentId);
  const reports = useCompletionReportsForIncident(incidentId);
  const resources = useResources();
  const resourceNames = new Map(resources.data?.map((resource) => [resource.id, resource.name]));
  if (!backup.data?.length && !reports.data?.length) return null;

  return (
    <section className="card card-body">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800"><CheckCircle2 size={16} /> Field response records</h3>
      {!!backup.data?.length && (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-red-700"><LifeBuoy size={14} /> Backup requests</p>
          {backup.data.map((request) => (
            <div key={request.id} className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-950">
              <div className="flex flex-wrap justify-between gap-2"><strong>{request.reason}</strong><span className="">{request.status}</span></div>
              <p className="mt-1">Requested {formatDateTime(request.created_at)}{request.location_accuracy_m != null ? ` · GPS accuracy ±${Math.round(request.location_accuracy_m)} m` : ' · no GPS supplied'}</p>
            </div>
          ))}
        </div>
      )}
      {!!reports.data?.length && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold text-green-700">Completion reports</p>
          {reports.data.map((report) => (
            <article key={report.id} className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-950">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1"><Users size={13} /> <strong>{report.people_reached}</strong> people reached</span>
                <span>{formatDateTime(report.created_at)}</span>
                {report.location_accuracy_m != null && <span className="flex items-center gap-1"><MapPin size={13} /> ±{Math.round(report.location_accuracy_m)} m</span>}
              </div>
              {report.supplies_used.length > 0 && <p className="mt-2 flex items-start gap-1"><PackageCheck size={13} className="mt-0.5 flex-shrink-0" /> Used: {report.supplies_used.map((usage) => `${resourceNames.get(usage.resource_id) ?? 'Reserved resource'} × ${usage.quantity}`).join(', ')}</p>}
              {report.further_help_needed && <p className="mt-2 flex items-start gap-1 rounded bg-red-100 p-2 text-red-900"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> Further help needed: {report.further_help_details}</p>}
              {report.notes && <p className="mt-2">Outcome notes: {report.notes}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
