import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LogOut, MapPin, Radio, Siren } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useAssignments, useIncidents, useTeams } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { AssignmentStatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { EmptyState, LoadingSpinner } from '@/components/ui/States';
import { INCIDENT_TYPE_LABELS } from '@/types';
import { useToast } from '@/components/ui/toast-context';

export function ResponderPage() {
  const auth = useAuth();
  const assignments = useAssignments();
  const incidents = useIncidents();
  const teams = useTeams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'dispatched' | 'completed' }) => {
      const { data, error } = await supabase.rpc('responder_update_assignment_status', { p_assignment_id: id, p_status: status });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
  const incidentById = new Map(incidents.data?.map((incident) => [incident.id, incident]));
  const teamById = new Map(teams.data?.map((team) => [team.id, team]));

  const changeStatus = async (id: string, status: 'dispatched' | 'completed') => {
    try { await updateStatus.mutateAsync({ id, status }); toast(status === 'dispatched' ? 'Assignment accepted — team en route' : 'Assignment completed', 'success'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Unable to update assignment', 'error'); }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-[#102e2b] text-white"><div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center"><div className="flex items-center gap-2 font-bold"><Radio size={20} /> ResQNet Field</div><button className="text-sm flex items-center gap-2 text-slate-200" onClick={() => void auth.signOut()}><LogOut size={15} /> Sign out</button></div></header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link to="/portal" className="text-sm text-neutral-500 flex gap-1 items-center mb-5"><ArrowLeft size={15} /> Workspaces</Link>
        <div><p className="text-xs uppercase tracking-widest text-primary-600 font-semibold">Responder workspace</p><h1 className="text-2xl font-bold mt-1">My team assignments</h1><p className="text-sm text-neutral-500 mt-1">Signed in as {auth.profile?.full_name}</p></div>
        <div className="mt-6 space-y-4">
          {assignments.isLoading || incidents.isLoading ? <div className="card card-body grid place-items-center"><LoadingSpinner /></div> : assignments.data?.length ? assignments.data.map((assignment) => { const incident = incidentById.get(assignment.incident_id); const team = teamById.get(assignment.team_id); return <article key={assignment.id} className="card card-body"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-neutral-400">{team?.team_code} · {team?.name}</p><h2 className="text-lg font-bold mt-1">{incident ? INCIDENT_TYPE_LABELS[incident.type] : 'Assigned incident'}</h2><p className="text-sm text-neutral-600 mt-1">{incident?.description}</p>{incident?.area_landmark && <p className="text-sm flex items-center gap-1 mt-3"><MapPin size={14} /> {incident.area_landmark}</p>}</div><div className="flex gap-2 items-start">{incident && <PriorityBadge level={incident.priority_level} />}<AssignmentStatusBadge status={assignment.status} /></div></div>{['assigned', 'dispatched'].includes(assignment.status) && <div className="flex gap-2 mt-5 pt-4 border-t">{assignment.status === 'assigned' && <button className="btn-primary" disabled={updateStatus.isPending} onClick={() => void changeStatus(assignment.id, 'dispatched')}><Siren size={16} /> Accept &amp; go en route</button>}{assignment.status === 'dispatched' && <button className="btn-primary" disabled={updateStatus.isPending} onClick={() => void changeStatus(assignment.id, 'completed')}><CheckCircle2 size={16} /> Complete response</button>}</div>}</article>; }) : <div className="card"><EmptyState title="No assignments" message="Your team has no active or historical assignments." /></div>}
        </div>
      </main>
    </div>
  );
}

