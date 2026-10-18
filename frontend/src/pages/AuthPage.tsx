import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Radio, ShieldCheck } from 'lucide-react';
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
          <CheckCircle2 size={42} className="mx-auto text-green-600 mb-4" />
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
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-600">{mode === 'login' ? 'Secure access' : 'Public account'}</p>
        <h1 className="text-2xl font-bold text-neutral-900 mt-1">{mode === 'login' ? 'Sign in to ResQNet' : 'Create your account'}</h1>
        <p className="text-sm text-neutral-500 mt-2">
          {mode === 'login' ? 'One login for personal, responder, and admin workspaces.' : 'New accounts begin with safe public-user access.'}
        </p>
      </div>

      {error && <div className="flex gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4"><AlertCircle size={18} className="shrink-0" />{error}</div>}

      <form className="space-y-4" onSubmit={submit}>
        {mode === 'signup' && (
          <div><label className="label">Full name</label><input className="input" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></div>
        )}
        <div><label className="label">Email address</label><input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
        <div>
          <div className="flex justify-between"><label className="label">Password</label>{mode === 'login' && <Link to="/forgot-password" className="text-xs text-primary-600">Forgot password?</Link>}</div>
          <input className="input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={busy || !isSupabaseConfigured}>
          {busy ? <LoadingSpinner size={17} /> : <>{mode === 'login' ? 'Sign in' : 'Create public account'}<ArrowRight size={17} /></>}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-neutral-200 text-center text-sm text-neutral-500">
        {mode === 'login' ? <>New to ResQNet? <Link className="text-primary-600 font-medium" to="/signup">Create an account</Link></> : <>Already registered? <Link className="text-primary-600 font-medium" to="/login">Sign in</Link></>}
      </div>
      {mode === 'signup' && <p className="text-xs text-neutral-400 text-center mt-3">Responder and administrator access is granted only through an invitation from an administrator.</p>}
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
  return <AuthShell>{sent ? <div className="text-center"><CheckCircle2 size={40} className="mx-auto text-green-600" /><h1 className="text-xl font-bold mt-3">Check your email</h1><p className="text-sm text-neutral-500 mt-2">If that account exists, a recovery link has been sent.</p></div> : <><h1 className="text-2xl font-bold mb-2">Reset your password</h1><p className="text-sm text-neutral-500 mb-5">Enter your account email.</p>{error && <p className="text-sm text-red-600 mb-3">{error}</p>}<form onSubmit={submit} className="space-y-4"><input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="btn-primary w-full justify-center" disabled={!isSupabaseConfigured}>Send recovery link</button></form></>}</AuthShell>;
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
  return <AuthShell><h1 className="text-2xl font-bold mb-2">Choose a new password</h1><p className="text-sm text-neutral-500 mb-5">Use at least eight characters.</p>{error && <p className="text-sm text-red-600 mb-3">{error}</p>}<form onSubmit={submit} className="space-y-4"><input className="input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /><button className="btn-primary w-full justify-center" disabled={!isSupabaseConfigured}>Update password</button></form></AuthShell>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 grid lg:grid-cols-[1fr_480px]">
      <div className="hidden lg:flex bg-[#102e2b] text-white p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-3"><span className="w-10 h-10 rounded-lg bg-[#176f63] grid place-items-center"><Radio size={22} /></span><strong className="text-xl tracking-wide">RESQNET</strong></Link>
        <div className="max-w-xl"><ShieldCheck size={42} className="text-emerald-300 mb-5" /><h2 className="text-4xl font-semibold leading-tight">One identity. The right access for every response role.</h2><p className="text-slate-300 mt-4 leading-relaxed">Citizens keep their reports, responders receive team-specific assignments, and administrators coordinate the operation.</p></div>
        <p className="text-xs text-slate-400">Emergency coordination system · Not a replacement for emergency services</p>
      </div>
      <div className="grid place-items-center p-6"><div className="w-full max-w-sm"><Link to="/" className="lg:hidden flex items-center gap-2 font-bold mb-8"><Radio size={20} /> ResQNet</Link><div className="card card-body shadow-sm">{supabaseConfigurationError && <div className="flex gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4"><AlertCircle size={18} className="shrink-0" />{supabaseConfigurationError}</div>}{children}</div></div></div>
    </div>
  );
}
