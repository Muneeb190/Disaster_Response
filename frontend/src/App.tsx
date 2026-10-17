import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { HomePage } from '@/pages/HomePage';
import { ReportPage } from '@/pages/ReportPage';
import { ReportStatusPage } from '@/pages/ReportStatusPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { IncidentDetailPage } from '@/pages/IncidentDetailPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { ResourcesPage } from '@/pages/ResourcesPage';
import { AssignmentsPage } from '@/pages/AssignmentsPage';
import { AuthProvider } from '@/auth/AuthContext';
import { ProtectedRoute, RoleRoute } from '@/auth/RouteGuards';
import { AuthPage, PasswordRecoveryPage, ResetPasswordPage } from '@/pages/AuthPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { MyReportsPage } from '@/pages/MyReportsPage';
import { ResponderPage } from '@/pages/ResponderPage';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { SheltersPage } from '@/pages/SheltersPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { SituationReportPage } from '@/pages/SituationReportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/status" element={<ReportStatusPage />} />
            <Route path="/dashboard" element={<RoleRoute allowed={['admin']}><DashboardPage /></RoleRoute>} />
            <Route path="/incidents" element={<RoleRoute allowed={['admin']}><IncidentsPage /></RoleRoute>} />
            <Route path="/incidents/:id" element={<RoleRoute allowed={['admin']}><IncidentDetailPage /></RoleRoute>} />
            <Route path="/teams" element={<RoleRoute allowed={['admin']}><TeamsPage /></RoleRoute>} />
            <Route path="/resources" element={<RoleRoute allowed={['admin']}><ResourcesPage /></RoleRoute>} />
            <Route path="/assignments" element={<RoleRoute allowed={['admin']}><AssignmentsPage /></RoleRoute>} />
            <Route path="/shelters" element={<RoleRoute allowed={['admin']}><SheltersPage /></RoleRoute>} />
            <Route path="/alerts" element={<RoleRoute allowed={['admin']}><AlertsPage /></RoleRoute>} />
            <Route path="/activity" element={<RoleRoute allowed={['admin']}><ActivityPage /></RoleRoute>} />
            <Route path="/reports/summary" element={<RoleRoute allowed={['admin']}><SituationReportPage /></RoleRoute>} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/portal" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
            <Route path="/my-reports" element={<ProtectedRoute><MyReportsPage /></ProtectedRoute>} />
            <Route path="/responder" element={<RoleRoute allowed={['responder']}><ResponderPage /></RoleRoute>} />
            <Route path="/admin/users" element={<RoleRoute allowed={['admin']}><AdminUsersPage /></RoleRoute>} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
