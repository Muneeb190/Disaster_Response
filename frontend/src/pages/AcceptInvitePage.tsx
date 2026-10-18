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
  // new=1 marks a freshly created account: it arrives signed in from the email link but has no password yet.
  const isNewAccount = params.get('new') === '1';
  // Supabase reports expired or reused email links in the URL hash.
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('error_description'));
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [acceptedRole, setAcceptedRole] = useState('');
  const loginReturnPath = `${location.pathname}?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!auth.loading && !auth.user && token && !isNewAccount && !linkError) {
      navigate('/login', { replace: true, state: { from: loginReturnPath } });
    }
  }, [auth.loading, auth.user, token, isNewAccount, linkError, navigate, loginReturnPath]);

  useEffect(() => {
    if (auth.profile?.full_name) setFullName((current) => current || auth.profile!.full_name);
  }, [auth.profile]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) { setError('The invitation link is missing its token.'); return; }
    setBusy(true); setError('');
    try {
      if (isNewAccount) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
        const { error: profileError } = await supabase.rpc('update_my_profile', { p_full_name: fullName });
        if (profileError) throw profileError;
      }
      const { data, error: acceptError } = await supabase.rpc('accept_role_invitation', { p_token_hash: await sha256(token) });
      if (acceptError) throw acceptError;
      await auth.refreshIdentity();
      setAcceptedRole((data as { role?: string } | null)?.role || 'new');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to accept invitation');
    } finally { setBusy(false); }
  };

  const switchAccount = async () => {
    await auth.signOut();
    navigate('/login', { replace: true, state: { from: loginReturnPath } });
  };

  if (auth.loading || (!auth.user && token && !isNewAccount && !linkError)) return <div className="min-h-screen grid place-items-center bg-neutral-50"><LoadingSpinner size={28} /></div>;

  let content: React.ReactNode;
  if (!auth.user) {
    content = <><AlertCircle size={46} className="mx-auto text-red-600" /><h1 className="text-2xl font-bold mt-4">Invitation link not valid</h1><p className="text-sm text-neutral-500 mt-2">{linkError || 'This invitation link has expired or was already used.'} Ask your administrator to send a new invitation.</p><p className="text-sm text-neutral-500 mt-2">Already set a password? Sign in to continue.</p><Link className="btn-primary justify-center mt-6" to="/login" state={{ from: loginReturnPath }}>Sign in</Link></>;
  } else if (acceptedRole) {
    content = <><CheckCircle2 size={46} className="mx-auto text-green-600" /><h1 className="text-2xl font-bold mt-4">Access granted</h1><p className="text-sm text-neutral-500 mt-2">The <strong>{acceptedRole}</strong> role is now attached to your account.{isNewAccount && ' You can sign in later with your email and the password you just set.'}</p><button className="btn-primary justify-center mt-6" onClick={() => navigate(homeForRoles(auth.roles), { replace: true })}>Open workspace</button></>;
  } else {
    content = (
      <>
        <ShieldCheck size={46} className="mx-auto text-primary-600" />
        <h1 className="text-2xl font-bold mt-4">Accept role invitation</h1>
        <p className="text-sm text-neutral-500 mt-2">This adds privileged access to <strong>{auth.profile?.email}</strong>.{isNewAccount ? ' Set up your account to continue.' : ' Your personal reports and public access stay unchanged.'}</p>
        {error && <div className="flex text-left gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-4"><AlertCircle size={18} className="shrink-0" />{error}</div>}
        <form className="space-y-4 mt-6 text-left" onSubmit={accept}>
          {isNewAccount && <>
            <div><label className="label">Full name</label><input className="input" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></div>
            <div><label className="label">Choose a password</label><input className="input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></div>
          </>}
          <button className="btn-primary w-full justify-center" disabled={busy || !token}>{busy ? <LoadingSpinner size={17} /> : 'Accept invitation'}</button>
        </form>
        <button className="btn-ghost btn-sm mt-3" onClick={() => void switchAccount()}>Not {auth.profile?.email}? Use a different account</button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 grid place-items-center p-6">
      <div className="card card-body w-full max-w-md text-center">
        <Link to="/" className="inline-flex justify-center items-center gap-2 font-bold mb-6"><Radio size={20} className="text-primary-600" /> ResQNet</Link>
        {content}
      </div>
    </div>
  );
}
