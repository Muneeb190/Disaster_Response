import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, type AppRole } from '@/auth/AuthContext';
import { LoadingSpinner } from '@/components/ui/States';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <FullPageLoader />;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (auth.profile?.account_status !== 'active') return <AccountUnavailable />;
  return children;
}

export function RoleRoute({ allowed, children }: { allowed: AppRole[]; children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <ProtectedRoute>
      {auth.roles.some((role) => allowed.includes(role)) ? children : <AccessDenied />}
    </ProtectedRoute>
  );
}

function FullPageLoader() {
  return <div className="min-h-screen grid place-items-center bg-neutral-50"><LoadingSpinner size={28} /></div>;
}

function AccountUnavailable() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50 p-6">
      <div className="card card-body max-w-md text-center">
        <ShieldAlert className="mx-auto text-red-600 mb-3" size={34} />
        <h1 className="text-xl font-bold">Account unavailable</h1>
        <p className="text-sm text-neutral-500 mt-2">This account is not active. Contact a ResQNet administrator.</p>
        <button className="btn-secondary mt-5" onClick={() => void signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50 p-6">
      <div className="card card-body max-w-md text-center">
        <ShieldAlert className="mx-auto text-yellow-600 mb-3" size={34} />
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-sm text-neutral-500 mt-2">Your account does not have permission to open this workspace.</p>
      </div>
    </div>
  );
}

