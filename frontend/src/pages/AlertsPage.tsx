import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, BellRing } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PriorityBadge } from '@/components/ui/Badges';
import { Skeleton, EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useAlerts, useAcknowledgeAlert } from '@/hooks/useData';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { ALERT_TYPE_LABELS, type Alert } from '@/types';

const ENTITY_LINKS: Record<string, (alert: Alert) => { to: string; label: string }> = {
  resource: () => ({ to: '/resources', label: 'Resources' }),
  shelter: () => ({ to: '/shelters', label: 'Shelters' }),
  team: () => ({ to: '/teams', label: 'Teams' }),
};

export function AlertsPage() {
  const { toast } = useToast();
  const alerts = useAlerts(300);
  const ack = useAcknowledgeAlert();
  const [tab, setTab] = useState<'unack' | 'ack' | 'all'>('unack');
  const [type, setType] = useState('');

  const all = alerts.data ?? [];
  const list = all.filter((a) => (tab === 'all' || (tab === 'unack' ? !a.acknowledged : a.acknowledged)) && (!type || a.type === type));
  const types = [...new Set(all.map((a) => a.type))];

  const acknowledge = async (id: string) => {
    try {
      await ack.mutateAsync(id);
      toast('Alert acknowledged', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to acknowledge', 'error'); }
  };

  return (
    <DashboardLayout title="Alerts" subtitle="Important changes that need a coordinator">
      <div className="card card-body mb-4 flex flex-wrap items-center gap-3">
        {([['unack', `Unacknowledged (${all.filter((a) => !a.acknowledged).length})`], ['ack', 'Acknowledged'], ['all', 'All']] as const).map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab(key)}>{label}</button>
        ))}
        <select className="select w-auto btn-sm ml-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{ALERT_TYPE_LABELS[t] ?? t}</option>)}
        </select>
      </div>

      {alerts.isLoading ? <Skeleton className="h-64 w-full" /> : list.length ? (
        <div className="card divide-y divide-neutral-100">
          {list.map((alert) => {
            const entity = !alert.incident_id && alert.entity_type ? ENTITY_LINKS[alert.entity_type]?.(alert) : undefined;
            return (
              <div key={alert.id} className="p-4 flex items-start gap-4">
                <PriorityBadge level={alert.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800">{alert.message}</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {ALERT_TYPE_LABELS[alert.type] ?? alert.type} · <span title={formatDateTime(alert.created_at)}>{timeAgo(alert.created_at)}</span>
                    {alert.incident_id && <> · <Link className="text-primary-600 underline" to={`/incidents/${alert.incident_id}`}>{alert.incidents?.report_code ?? 'Open incident'}</Link></>}
                    {entity && <> · <Link className="text-primary-600 underline" to={entity.to}>{entity.label}</Link></>}
                  </p>
                  {alert.acknowledged && (
                    <p className="text-xs text-green-700 mt-1">
                      Acknowledged{alert.profiles ? ` by ${alert.profiles.full_name || alert.profiles.email}` : ''}{alert.acknowledged_at ? ` · ${timeAgo(alert.acknowledged_at)}` : ''}
                    </p>
                  )}
                </div>
                {!alert.acknowledged && <button className="btn-secondary btn-sm" disabled={ack.isPending} onClick={() => void acknowledge(alert.id)}><Check size={14} /> Acknowledge</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><EmptyState icon={<BellRing size={38} />} title={tab === 'unack' ? 'Nothing waiting' : 'No alerts'} message={tab === 'unack' ? 'Every alert has been acknowledged.' : 'No alerts match this filter.'} /></div>
      )}
    </DashboardLayout>
  );
}
