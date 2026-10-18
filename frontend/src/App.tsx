import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/auth/AuthContext';
import { ProtectedRoute, RoleRoute } from '@/auth/RouteGuards';
import { NetworkStatusBanner } from '@/components/system/NetworkStatusBanner';
import { LangProvider } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/ui/States';
import { HomePage } from '@/pages/HomePage';

// Public reporting loads first; coordinator and responder screens are split into their own chunks.
const page = <T extends Record<string, React.ComponentType<never>>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((module) => ({ default: module[name] as React.ComponentType })));

const ReportPage = page(() => import('@/pages/ReportPage'), 'ReportPage');
const ReportStatusPage = page(() => import('@/pages/ReportStatusPage'), 'ReportStatusPage');
const AtRiskRegisterPage = page(() => import('@/pages/AtRiskRegisterPage'), 'AtRiskRegisterPage');
const SafetyCheckinPage = page(() => import('@/pages/SafetyCheckinPage'), 'SafetyCheckinPage');
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage');
const IncidentsPage = page(() => import('@/pages/IncidentsPage'), 'IncidentsPage');
const IncidentDetailPage = page(() => import('@/pages/IncidentDetailPage'), 'IncidentDetailPage');
const TeamsPage = page(() => import('@/pages/TeamsPage'), 'TeamsPage');
const ResourcesPage = page(() => import('@/pages/ResourcesPage'), 'ResourcesPage');
const AssignmentsPage = page(() => import('@/pages/AssignmentsPage'), 'AssignmentsPage');
const SheltersPage = page(() => import('@/pages/SheltersPage'), 'SheltersPage');
const AlertsPage = page(() => import('@/pages/AlertsPage'), 'AlertsPage');
const ActivityPage = page(() => import('@/pages/ActivityPage'), 'ActivityPage');
const SituationReportPage = page(() => import('@/pages/SituationReportPage'), 'SituationReportPage');
const VulnerabilityPage = page(() => import('@/pages/VulnerabilityPage'), 'VulnerabilityPage');
const PlanningPage = page(() => import('@/pages/PlanningPage'), 'PlanningPage');
const AuthPage = lazy(() => import('@/pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const PasswordRecoveryPage = page(() => import('@/pages/AuthPage'), 'PasswordRecoveryPage');
const ResetPasswordPage = page(() => import('@/pages/AuthPage'), 'ResetPasswordPage');
const AcceptInvitePage = page(() => import('@/pages/AcceptInvitePage'), 'AcceptInvitePage');
const WorkspacePage = page(() => import('@/pages/WorkspacePage'), 'WorkspacePage');
const MyReportsPage = page(() => import('@/pages/MyReportsPage'), 'MyReportsPage');
const ResponderPage = page(() => import('@/pages/ResponderPage'), 'ResponderPage');
const AdminUsersPage = page(() => import('@/pages/AdminUsersPage'), 'AdminUsersPage');

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1, refetchOnWindowFocus: true } },
});

const admin = (element: React.ReactNode) => <RoleRoute allowed={['admin']}>{element}</RoleRoute>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <ToastProvider>
          <NetworkStatusBanner />
          <BrowserRouter>
            <AuthProvider>
              <Suspense fallback={<div className="grid min-h-screen place-items-center"><LoadingSpinner size={28} /></div>}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/report" element={<ReportPage />} />
                  <Route path="/status" element={<ReportStatusPage />} />
                  <Route path="/register-at-risk" element={<AtRiskRegisterPage />} />
                  <Route path="/check-in" element={<SafetyCheckinPage />} />
                  <Route path="/dashboard" element={admin(<DashboardPage />)} />
                  <Route path="/incidents" element={admin(<IncidentsPage />)} />
                  <Route path="/incidents/:id" element={admin(<IncidentDetailPage />)} />
                  <Route path="/teams" element={admin(<TeamsPage />)} />
                  <Route path="/resources" element={admin(<ResourcesPage />)} />
                  <Route path="/assignments" element={admin(<AssignmentsPage />)} />
                  <Route path="/shelters" element={admin(<SheltersPage />)} />
                  <Route path="/alerts" element={admin(<AlertsPage />)} />
                  <Route path="/activity" element={admin(<ActivityPage />)} />
                  <Route path="/reports/summary" element={admin(<SituationReportPage />)} />
                  <Route path="/vulnerability" element={admin(<VulnerabilityPage />)} />
                  <Route path="/planning" element={admin(<PlanningPage />)} />
                  <Route path="/admin/users" element={admin(<AdminUsersPage />)} />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/signup" element={<AuthPage mode="signup" />} />
                  <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/accept-invite" element={<AcceptInvitePage />} />
                  <Route path="/portal" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
                  <Route path="/my-reports" element={<ProtectedRoute><MyReportsPage /></ProtectedRoute>} />
                  <Route path="/responder" element={<RoleRoute allowed={['responder']}><ResponderPage /></RoleRoute>} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}
