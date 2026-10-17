import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, Shield, UserRound, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, LoadingSpinner } from '@/components/ui/States';
import { useTeams } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { useAuth, type AppRole, type UserProfile } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast-context';

type UserRow = UserProfile & {
  user_roles: { role: AppRole }[];
  team_members: { team_id: string; active: boolean }[];
};

type InviteResult = { invitation_url: string; email_sent: boolean; existing_user: boolean; expires_at: string };

export function AdminUsersPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const teams = useTeams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'responder' | 'admin'>('responder');
  const [teamId, setTeamId] = useState('');
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id,email,full_name,account_status,user_roles(role),team_members(team_id,active)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as UserRow[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('invite-role', {
        body: { email, full_name: fullName, role, team_id: role === 'responder' ? teamId : null },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      return data as InviteResult;
    },
    onSuccess: (result) => {
      setInviteResult(result);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast(result.email_sent ? 'Invitation email sent' : 'Role invitation created — copy the secure link', 'success');
    },
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, revokeRole }: { userId: string; revokeRole: 'admin' | 'responder' }) => {
      const { error } = await supabase.rpc('admin_revoke_role', { p_user_id: userId, p_role: revokeRole, p_reason: 'Revoked from user management' });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast('Role removed', 'success'); },
    onError: (error) => toast(error instanceof Error ? error.message : 'Unable to remove role', 'error'),
  });

  const teamNames = useMemo(() => new Map(teams.data?.map((team) => [team.id, team.name])), [teams.data]);
  const closeInvite = () => { setInviteOpen(false); setInviteResult(null); setEmail(''); setFullName(''); setTeamId(''); setRole('responder'); };

  return (
    <DashboardLayout title="User management" subtitle="Invite responders and administrators">
      <div className="flex justify-between items-end gap-4 mb-6"><div><p className="command-breadcrumb">ADMINISTRATION / ACCESS CONTROL</p><h1 className="text-3xl font-semibold">Users and roles</h1><p className="text-sm text-neutral-500 mt-1">Roles are additive; every account retains public-user access.</p></div><button className="btn-primary" onClick={() => setInviteOpen(true)}><Plus size={16} /> Invite user</button></div>
      {users.isLoading ? <div className="card card-body grid place-items-center"><LoadingSpinner /></div> : users.data?.length ? <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-4">User</th><th className="p-4">Roles</th><th className="p-4">Team</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody>{users.data.map((user) => <tr key={user.id} className="border-t"><td className="p-4"><strong>{user.full_name || 'Unnamed user'}</strong><span className="block text-xs text-neutral-500">{user.email}</span></td><td className="p-4"><div className="flex flex-wrap gap-1">{user.user_roles.map(({ role: userRole }) => <span key={userRole} className={userRole === 'admin' ? 'badge-info' : userRole === 'responder' ? 'badge-warning' : 'badge-neutral'}>{userRole}</span>)}</div></td><td className="p-4 text-neutral-600">{user.team_members.filter((member) => member.active).map((member) => teamNames.get(member.team_id) || 'Team').join(', ') || '—'}</td><td className="p-4"><span className={user.account_status === 'active' ? 'badge-success' : 'badge-error'}>{user.account_status}</span></td><td className="p-4"><div className="flex justify-end gap-2">{user.user_roles.some((item) => item.role === 'responder') && <button className="btn-ghost btn-sm" onClick={() => revoke.mutate({ userId: user.id, revokeRole: 'responder' })}>Remove responder</button>}{user.id !== auth.user?.id && user.user_roles.some((item) => item.role === 'admin') && <button className="btn-ghost btn-sm text-red-600" onClick={() => revoke.mutate({ userId: user.id, revokeRole: 'admin' })}>Remove admin</button>}</div></td></tr>)}</tbody></table></div></div> : <div className="card"><EmptyState icon={<Users size={38} />} title="No users" message="Invite the first team member." /></div>}

      <Modal open={inviteOpen} onClose={closeInvite} title="Invite user" size="md">
        {inviteResult ? <div className="space-y-4"><div className="w-12 h-12 rounded-full bg-green-50 text-green-600 grid place-items-center"><Check /></div><div><h3 className="font-bold">Invitation ready</h3><p className="text-sm text-neutral-500 mt-1">{inviteResult.email_sent ? 'A new-account invitation was sent by email.' : 'This email already has an account. Share this one-time role link with that person.'}</p></div><div className="bg-neutral-50 border rounded-lg p-3 break-all text-xs font-mono">{inviteResult.invitation_url}</div><button className="btn-secondary w-full justify-center" onClick={() => { void navigator.clipboard.writeText(inviteResult.invitation_url); toast('Invitation link copied', 'success'); }}><Copy size={15} /> Copy secure link</button><button className="btn-primary w-full justify-center" onClick={closeInvite}>Done</button></div> : <div className="space-y-4"><div><label className="label">Email</label><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div><label className="label">Name <span className="text-neutral-400">(new accounts)</span></label><input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div><div><label className="label">Access to grant</label><div className="grid grid-cols-2 gap-2"><button type="button" className={`card card-body text-left ${role === 'responder' ? 'border-primary-500 bg-blue-50' : ''}`} onClick={() => setRole('responder')}><UserRound size={20} /><strong className="text-sm mt-2">Responder</strong></button><button type="button" className={`card card-body text-left ${role === 'admin' ? 'border-primary-500 bg-blue-50' : ''}`} onClick={() => setRole('admin')}><Shield size={20} /><strong className="text-sm mt-2">Administrator</strong></button></div></div>{role === 'responder' && <div><label className="label">Rescue team</label><select className="select" value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Select team</option>{teams.data?.map((team) => <option value={team.id} key={team.id}>{team.team_code} — {team.name}</option>)}</select></div>}<div className="flex justify-end gap-2 pt-2"><button className="btn-secondary" onClick={closeInvite}>Cancel</button><button className="btn-primary" disabled={!email || (role === 'responder' && !teamId) || invite.isPending} onClick={() => invite.mutate()}>{invite.isPending ? <LoadingSpinner size={16} /> : 'Create invitation'}</button></div>{invite.error && <p className="text-sm text-red-600">{invite.error instanceof Error ? invite.error.message : 'Invitation failed'}</p>}</div>}
      </Modal>
    </DashboardLayout>
  );
}

