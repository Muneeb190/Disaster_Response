import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Accessibility, RefreshCw, Truck, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast-context';

type Move = { id: string; reason: string; status: string; rescue_teams?: { name: string } | null; resources?: { name: string } | null };
type Evac = { id: string; reason: string; status: string; at_risk_residents?: { full_name: string; needs: string[] } | null };

export function EarlyActionPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const early = useQuery({
    queryKey: ['early-actions'],
    queryFn: async () => {
      const [moves, evacs] = await Promise.all([
        supabase.from('prepositioning_suggestions').select('*,rescue_teams(name),resources(name)').order('created_at', { ascending: false }),
        supabase.from('pre_hazard_evacuations').select('*,at_risk_residents(full_name,needs),hazard_events(title)').order('created_at', { ascending: false }),
      ]);
      if (moves.error) throw moves.error;
      if (evacs.error) throw evacs.error;
      return { moves: (moves.data ?? []) as Move[], evacs: (evacs.data ?? []) as Evac[] };
    },
  });
  const onError = (error: unknown) => toast(error instanceof Error ? error.message : 'That did not work. Try again.', 'error');
  const generate = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('admin_generate_early_actions'); if (error) throw error; }, onSuccess: () => { toast('Early actions checked against active warnings', 'success'); void qc.invalidateQueries({ queryKey: ['early-actions'] }); }, onError });
  const approve = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.rpc('admin_approve_prepositioning', { p_id: id, p_destination: 'Islamabad warning area' }); if (error) throw error; }, onSuccess: () => { toast('Move approved and logged', 'success'); void qc.invalidateQueries({ queryKey: ['early-actions'] }); }, onError });

  return (
    <section className="card mb-5 overflow-hidden" aria-labelledby="early-title">
      <div className="panel-head flex-wrap">
        <div>
          <h2 id="early-title" className="panel-title">Act before reports arrive</h2>
          <p className="text-sm text-neutral-500">Active warnings matched to free teams, and registered residents who cannot leave on their own.</p>
        </div>
        <button className="btn-secondary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}><RefreshCw size={15} aria-hidden="true" />Check warnings again</button>
      </div>
      <div className="grid divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="p-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Truck size={18} aria-hidden="true" className="text-primary-600" />Move teams and supplies closer</h3>
          {early.data?.moves.length ? (
            <ul className="mt-3 space-y-2">
              {early.data.moves.slice(0, 6).map((move) => (
                <li key={move.id} className="flex items-start justify-between gap-3 rounded-control border border-line p-3">
                  <div><p className="font-semibold">{move.rescue_teams?.name ?? 'A free team'}{move.resources?.name && <span className="font-normal text-neutral-500"> with {move.resources.name}</span>}</p><p className="text-sm text-neutral-600">{move.reason}</p></div>
                  {move.status === 'suggested' ? <button className="btn-primary btn-sm shrink-0" onClick={() => approve.mutate(move.id)}>Approve</button> : <span className="badge-success shrink-0"><Check size={13} aria-hidden="true" />Approved</span>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[15px] text-neutral-500">No moves suggested. They appear when a warning covers an area with no capable team nearby.</p>}
        </div>
        <div className="p-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Accessibility size={18} aria-hidden="true" className="text-primary-600" />Help out before it gets worse</h3>
          {early.data?.evacs.length ? (
            <ul className="mt-3 space-y-2">
              {early.data.evacs.slice(0, 8).map((evac) => (
                <li key={evac.id} className="rounded-control border border-line p-3">
                  <p className="font-semibold">{evac.at_risk_residents?.full_name}</p>
                  <p className="text-sm text-neutral-600">{evac.at_risk_residents?.needs?.map((need) => need.replace(/_/g, ' ')).join(', ') || 'Needs a transport check'}</p>
                  <p className="text-sm capitalize text-neutral-500">{evac.status.replace(/_/g, ' ')}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[15px] text-neutral-500">Nobody on the register is under an active warning.</p>}
        </div>
      </div>
    </section>
  );
}
