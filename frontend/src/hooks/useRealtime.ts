import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { showBrowserNotification } from '@/lib/notifications';

export function useRealtimeSync() {
  const qc = useQueryClient();
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const channel = supabase
      .channel('resqnet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        qc.invalidateQueries({ queryKey: ['incidents'] });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
        qc.invalidateQueries({ queryKey: ['assignments'] });
        qc.invalidateQueries({ queryKey: ['incidents'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['alerts'] });
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      mounted.current = false;
    };
  }, [qc]);
}
