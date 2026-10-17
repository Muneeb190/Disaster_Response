import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Radio, ShieldCheck } from 'lucide-react';
import { useAuth, homeForRoles } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/ui/States';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function AcceptInvitePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [acceptedRole, setAcceptedRole] = useState('');

  useEffect(() => {
    if (!auth.loading && !auth.user && token) {
      navigate('/login', { replace: true, state: { from: `${location.pathname}${location.search}` } });
    }
  }, [auth.loading, auth.user, token, navigate, location.pathname, location.search]);

  const accept = async () => {
    if (!token) { setError('The invitation link is missing its token.'); return; }
    setBusy(true); setError('');
    try {
      const tokenHash = await sha256(token);
      const { data, error: acceptError } = await supabase.rpc('accept_role_invitation', { p_token_hash: tokenHash });
      if (acceptError) throw acceptError;
      await auth.refreshIdentity();
      setAcceptedRole((data as { role?: string } | null)?.role || 'new');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to accept invitation');
    } finally { setBusy(false); }
  };

  if (auth.loading || (!auth.user && token)) return <div className="min-h-screen grid place-items-center bg-neutral-50"><LoadingSpinner size={28} /></div>;

  return (
    <div className="min-h-screen bg-neutral-50 grid place-items-center p-6">
      <div className="card card-body w-full max-w-md text-center">
        <Link to="/" className="inline-flex justify-center items-center gap-2 font-bold mb-6"><Radio size={20} className="text-primary-600" /> ResQNet</Link>
        {acceptedRole ? <><CheckCircle2 size={46} className="mx-auto text-green-600" /><h1 className="text-2xl font-bold mt-4">Access granted</h1><p className="text-sm text-neutral-500 mt-2">The <strong>{acceptedRole}</strong> role is now attached to your existing account.</p><button className="btn-primary justify-center mt-6" onClick={() => navigate(homeForRoles(auth.roles), { replace: true })}>Open workspace</button></> : <><ShieldCheck size={46} className="mx-auto text-primary-600" /><h1 className="text-2xl font-bold mt-4">Accept role invitation</h1><p className="text-sm text-neutral-500 mt-2">This adds privileged access to <strong>{auth.profile?.email}</strong>. Your personal reports and public access stay unchanged.</p>{error && <div className="flex text-left gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-4"><AlertCircle size={18} className="shrink-0" />{error}</div>}<button className="btn-primary justify-center mt-6" disabled={busy || !token} onClick={() => void accept()}>{busy ? <LoadingSpinner size={17} /> : 'Accept invitation'}</button></>}
      </div>
    </div>
  );
}

