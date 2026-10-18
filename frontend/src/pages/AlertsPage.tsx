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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
  const [sms,setSms]=useState(''); const qc=useQueryClient();
  const smsInbox=useQuery({queryKey:['sms-inbox'],queryFn:async()=>{const{data,error}=await supabase.from('sms_inbox').select('*').order('received_at',{ascending:false}).limit(10);if(error)throw error;return data}});
  const syncConflicts=useQuery({queryKey:['sync-conflicts'],queryFn:async()=>{const{data,error}=await supabase.from('sync_operations').select('id,operation_type,error,created_at').eq('status','conflict').order('created_at',{ascending:false}).limit(20);if(error)throw error;return data}});
  const simulateSms=useMutation({mutationFn:async()=>{const{data:{session}}=await supabase.auth.getSession();const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-intake`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token??''}`},body:JSON.stringify({from:'+923000000000',message:sms,simulation:true})});const data=await response.json();if(!response.ok)throw new Error(data.error||'SMS intake failed')},onSuccess:()=>{setSms('');toast('Simulated SMS received for coordinator review','success');void qc.invalidateQueries({queryKey:['sms-inbox']})}});

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
      {!!syncConflicts.data?.length&&<section className="card card-body mb-4 border-amber-300"><h2 className="font-semibold text-amber-800">Offline sync conflicts</h2><p className="text-xs text-neutral-500">These field actions could not be applied safely after reconnecting and require coordinator review.</p>{syncConflicts.data.map(row=><div key={row.id} className="mt-2 rounded bg-amber-50 p-2 text-xs"><strong>{row.operation_type}</strong> · {row.error}</div>)}</section>}
      <section className="card card-body mb-4"><h2 className="font-semibold">Low-signal SMS inbox <span className="badge-neutral ml-2">SIMULATED</span></h2><p className="text-xs text-neutral-500 mt-1">Messages without coordinates remain for human review; coordinates from a real provider can create an incident.</p><div className="flex gap-2 mt-3"><input className="input" value={sms} onChange={e=>setSms(e.target.value)} placeholder="Example: Flood water rising near bridge, family needs help"/><button className="btn-primary" disabled={sms.trim().length<5||simulateSms.isPending} onClick={()=>void simulateSms.mutateAsync()}>Receive SMS</button></div>{!!smsInbox.data?.length&&<div className="mt-3 space-y-2">{smsInbox.data.map(row=><div key={row.id} className="rounded border p-2 text-xs"><strong>{row.sender_masked}</strong> · {row.status}<p>{row.message}</p></div>)}</div>}</section>
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
