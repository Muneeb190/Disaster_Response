import { useQuery } from '@tanstack/react-query';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState, LoadingSpinner } from '@/components/ui/States';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badges';
import { INCIDENT_TYPE_LABELS, type Incident } from '@/types';
import { timeAgo } from '@/lib/utils';

export function MyReportsPage() {
  const auth = useAuth();
  const reports = useQuery({
    queryKey: ['my-reports', auth.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('incidents').select('*').eq('reporter_user_id', auth.user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Incident[];
    },
    enabled: Boolean(auth.user),
  });

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/portal" className="text-sm text-neutral-500 flex gap-1 items-center mb-5"><ArrowLeft size={15} /> Workspaces</Link>
        <div className="flex items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">My emergency reports</h1><p className="text-sm text-neutral-500 mt-1">Reports submitted while signed into this account.</p></div><Link to="/report" className="btn-primary"><Plus size={16} /> New report</Link></div>
        <div className="mt-6 space-y-3">
          {reports.isLoading ? <div className="card card-body grid place-items-center"><LoadingSpinner /></div> : reports.data?.length ? reports.data.map((report) => <div className="card card-body" key={report.id}><div className="flex flex-wrap justify-between gap-3"><div><code className="font-bold text-primary-700">{report.report_code}</code><h2 className="font-semibold mt-1">{INCIDENT_TYPE_LABELS[report.type]} · {report.area_landmark || 'Pinned location'}</h2><p className="text-sm text-neutral-500 mt-1 line-clamp-2">{report.description}</p></div><div className="flex items-start gap-2"><PriorityBadge level={report.priority_level} /><StatusBadge status={report.status} /></div></div><p className="text-xs text-neutral-400 flex items-center gap-1 mt-4"><Clock size={12} /> Submitted {timeAgo(report.created_at)}</p></div>) : <div className="card"><EmptyState title="No reports yet" message="Reports made while signed in will appear here." /></div>}
        </div>
      </main>
    </div>
  );
}

