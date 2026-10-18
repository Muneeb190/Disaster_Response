import { Link } from 'react-router-dom';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Activity, ArrowRight, Shield, Siren, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

export function WorkspacePage() {
  const auth = useAuth();
  const workspaces = [
    { show: true, to: '/my-reports', title: 'Personal', description: 'Report emergencies and follow your reports.', icon: UserRound },
    { show: auth.hasRole('responder'), to: '/responder', title: 'Responder', description: 'Open your team assignments and field updates.', icon: Siren },
    { show: auth.hasRole('admin'), to: '/dashboard', title: 'Command Center', description: 'Coordinate incidents, teams, resources, and alerts.', icon: Shield },
  ].filter((workspace) => workspace.show);

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-sm text-neutral-500">Signed in as {auth.profile?.email}</p>
        <h1 className="text-3xl font-bold mt-1">Welcome, {auth.profile?.full_name || 'ResQNet user'}</h1>
        <p className="text-neutral-500 mt-2">Choose a workspace. Access is based on roles granted to this account.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {workspaces.map((workspace) => <Link key={workspace.to} to={workspace.to} className="card card-body hover:border-primary-300 transition-colors group"><workspace.icon size={26} className="text-primary-600" /><h2 className="font-bold text-lg mt-4">{workspace.title}</h2><p className="text-sm text-neutral-500 mt-1 min-h-10">{workspace.description}</p><span className="text-sm text-primary-600 font-medium flex items-center gap-1 mt-5">Open workspace <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" /></span></Link>)}
        </div>
        <div className="mt-8 text-xs text-neutral-400 flex items-center gap-2"><Activity size={14} /> Roles: {auth.roles.join(', ')}</div>
      </main>
    </div>
  );
}

