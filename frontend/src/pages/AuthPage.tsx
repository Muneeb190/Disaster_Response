import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Wordmark } from '@/components/brand/Brand';
import { useForceLtr } from '@/lib/i18n';
import { isSupabaseConfigured, supabase, supabaseConfigurationError } from '@/lib/supabase';
import { useAuth, homeForRoles } from '@/auth/AuthContext';
import { LoadingSpinner } from '@/components/ui/States';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  const returnTo = (location.state as { from?: string } | null)?.from;
  if (!auth.loading && auth.user && mode === 'login') return <Navigate to={returnTo || homeForRoles(auth.roles)} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setError(supabaseConfigurationError ?? 'Authentication is not configured');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/portal`,
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) setConfirmationSent(true);
        else navigate('/portal', { replace: true });
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        navigate(returnTo || '/portal', { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthShell>
        <div className="text-center">
          <CheckCircle2 size={42} className="mx-auto text-success mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900">Check your email</h1>
          <p className="text-sm text-neutral-500 mt-2">We sent a confirmation link to <strong>{email}</strong>.</p>
          <Link className="btn-primary mt-6" to="/login">Return to login</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{mode === 'login' ? 'Sign in to ResQNet' : 'Create your account'}</h1>
        <p className="mt-2 text-neutral-500">
          {mode === 'login' ? 'For coordinators, responders and people tracking their own reports.' : 'New accounts can track their own reports. Staff access comes by invitation.'}
        </p>
      </div>

      {error && <div className="flex gap-2 mb-4 rounded-control border border-critical-line bg-critical-soft p-3 text-sm text-critical"><AlertCircle size={18} className="shrink-0" />{error}</div>}

      <form className="space-y-4" onSubmit={submit}>
        {mode === 'signup' && (
          <div><label htmlFor="full-name" className="label">Full name</label><input id="full-name" className="input" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></div>
        )}
        <div><label htmlFor="email" className="label">Email address</label><input id="email" className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
        <div>
          <div className="flex justify-between"><label htmlFor="password" className="label">Password</label>{mode === 'login' && <Link to="/forgot-password" className="text-sm font-semibold text-primary-700 hover:underline">Forgot password?</Link>}</div>
          <input id="password" className="input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={busy || !isSupabaseConfigured}>
          {busy ? <LoadingSpinner size={17} className="border-white/40 border-t-white" /> : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-5 text-center text-neutral-500">
        {mode === 'login' ? <>New to ResQNet? <Link className="font-semibold text-primary-700 hover:underline" to="/signup">Create an account</Link></> : <>Already registered? <Link className="font-semibold text-primary-700 hover:underline" to="/login">Sign in</Link></>}
      </div>
      {mode === 'signup' && <p className="mt-3 text-center text-sm text-neutral-500">Responder and administrator access is granted only through an invitation from an administrator.</p>}
    </AuthShell>
  );
}

export function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!isSupabaseConfigured) { setError(supabaseConfigurationError ?? 'Authentication is not configured'); return; }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (resetError) setError(resetError.message); else setSent(true);
  };
  return <AuthShell>{sent ? <div className="text-center"><CheckCircle2 size={40} className="mx-auto text-success" /><h1 className="text-xl font-bold mt-3">Check your email</h1><p className="text-sm text-neutral-500 mt-2">If that account exists, a recovery link has been sent.</p></div> : <><h1 className="text-2xl font-bold mb-2">Reset your password</h1><p className="text-sm text-neutral-500 mb-5">Enter your account email.</p>{error && <p className="text-sm text-critical mb-3">{error}</p>}<form onSubmit={submit} className="space-y-4"><input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="btn-primary w-full justify-center" disabled={!isSupabaseConfigured}>Send recovery link</button></form></>}</AuthShell>;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!isSupabaseConfigured) { setError(supabaseConfigurationError ?? 'Authentication is not configured'); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message); else navigate('/portal', { replace: true });
  };
  return <AuthShell><h1 className="text-2xl font-bold mb-2">Choose a new password</h1><p className="text-sm text-neutral-500 mb-5">Use at least eight characters.</p>{error && <p className="text-sm text-critical mb-3">{error}</p>}<form onSubmit={submit} className="space-y-4"><input className="input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /><button className="btn-primary w-full justify-center" disabled={!isSupabaseConfigured}>Update password</button></form></AuthShell>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  useForceLtr();
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1fr_520px]">
      <div className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Link to="/" aria-label="ResQNet home"><Wordmark inverted sub="Islamabad disaster response" /></Link>
        <div className="max-w-xl">
          <h2 className="font-display text-5xl font-bold leading-[1.05] text-white">Find the people most at risk. Reach them first.</h2>
          <p className="mt-5 text-lg text-[#C9D6D4]">Coordinators see every report with its reasons, responders get only their own jobs, and nobody is left out because they could not report.</p>
        </div>
        <p className="text-sm text-[#8FA6A3]">ResQNet supports, and never replaces, official emergency services.</p>
      </div>
      <div className="grid place-items-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block lg:hidden" aria-label="ResQNet home"><Wordmark sub="Islamabad disaster response" /></Link>
          {supabaseConfigurationError && <div className="mb-4 flex gap-2 rounded-control border border-critical-line bg-critical-soft p-3 text-sm text-critical"><AlertCircle size={18} className="shrink-0" aria-hidden="true" />{supabaseConfigurationError}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
