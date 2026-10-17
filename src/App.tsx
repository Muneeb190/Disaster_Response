import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, X } from 'lucide-react';
import { ToastProvider } from '@/components/ui/Toast';
import { isSupabaseConfigured } from '@/lib/supabase';
import { HomePage } from '@/pages/HomePage';
import { ReportPage } from '@/pages/ReportPage';
import { ReportStatusPage } from '@/pages/ReportStatusPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { IncidentDetailPage } from '@/pages/IncidentDetailPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { ResourcesPage } from '@/pages/ResourcesPage';
import { AssignmentsPage } from '@/pages/AssignmentsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function SupabaseNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (isSupabaseConfigured || dismissed) return null;

  return (
    <aside aria-label="Supabase configuration notice" className="bg-amber-500 text-neutral-900 px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-50 font-medium shadow-sm">
      <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
        <AlertCircle size={15} className="shrink-0" />
        <span>
          Supabase demo mode: To connect your live database, add your real Supabase credentials to <code className="bg-black/10 px-1 py-0.5 rounded font-mono">.env</code>.
        </span>
      </div>
      <button onClick={() => setDismissed(true)} className="p-1 hover:bg-black/10 rounded" title="Dismiss notice">
        <X size={14} />
      </button>
    </aside>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SupabaseNotice />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/status" element={<ReportStatusPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
