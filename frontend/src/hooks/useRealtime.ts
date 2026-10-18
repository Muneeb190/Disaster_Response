import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { showBrowserNotification } from '@/lib/notifications';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

// Subscribes to operational tables and reports the real connection state for the UI.
export function useRealtimeSync(): RealtimeStatus {
  const qc = useQueryClient();
  const mounted = useRef(false);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    // A removed channel still reports CLOSED; it must not overwrite the live channel's state.
    let active = true;

    const channel = supabase
      .channel('resqnet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        qc.invalidateQueries({ queryKey: ['incidents'] });
        qc.invalidateQueries({ queryKey: ['incident'] });
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rescue_teams' }, () => {
        qc.invalidateQueries({ queryKey: ['teams'] });
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => {
        qc.invalidateQueries({ queryKey: ['resources'] });
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelters' }, () => {
        qc.invalidateQueries({ queryKey: ['shelters'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
        qc.invalidateQueries({ queryKey: ['assignments'] });
        qc.invalidateQueries({ queryKey: ['assignments-incident'] });
        qc.invalidateQueries({ queryKey: ['incidents'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['alerts'] });
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
        if (payload.eventType === 'INSERT') {
          const alert = payload.new as { severity?: string; message?: string };
          void showBrowserNotification(`ResQNet ${alert.severity ?? 'alert'}`, alert.message ?? 'New response alert');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'danger_zones' }, () => {
        qc.invalidateQueries({ queryKey: ['danger-zones'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalations' }, () => {
        qc.invalidateQueries({ queryKey: ['escalations'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_events' }, () => {
        qc.invalidateQueries({ queryKey: ['incident-events'] });
      })
      .subscribe((state) => {
        if (!active) return;
        setStatus(state === 'SUBSCRIBED' ? 'live' : state === 'CLOSED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' ? 'offline' : 'connecting');
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
      mounted.current = false;
    };
  }, [qc]);

  return status;
}
