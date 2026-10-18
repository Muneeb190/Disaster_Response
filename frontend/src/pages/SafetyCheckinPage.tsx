import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, LifeBuoy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useLang } from '@/lib/i18n';

type State = 'idle' | 'saving' | 'safe' | 'needs_help' | 'error';

export function SafetyCheckinPage() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>('idle');

  const respond = async (status: 'safe' | 'needs_help') => {
    setState('saving');
    const { error } = await supabase.rpc('public_safety_checkin', { p_token: token, p_status: status });
    setState(error ? 'error' : status);
  };

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <h1 className="text-[40px] font-bold leading-tight">{t('checkin.title')}</h1>
        <p className="mt-2 text-lg text-neutral-600">{t('checkin.lead')}</p>

        <div className="mt-8" aria-live="polite">
          {!token ? (
            <p className="rounded-panel border border-critical-line bg-critical-soft p-5 text-critical">{t('checkin.missing')}</p>
          ) : state === 'safe' ? (
            <p className="rounded-panel border border-success-line bg-success-soft p-5 text-lg text-success">{t('checkin.savedSafe')}</p>
          ) : state === 'needs_help' ? (
            <p className="rounded-panel border border-critical-line bg-critical-soft p-5 text-lg text-critical">{t('checkin.savedHelp')}</p>
          ) : state === 'error' ? (
            <div className="rounded-panel border border-line bg-surface p-5">
              <p className="text-neutral-700">{t('checkin.invalid')}</p>
              <Link to="/report" className="btn-danger mt-4">{t('checkin.reportInstead')}</Link>
            </div>
          ) : (
            <div className="grid gap-3">
              <button className="flex min-h-[84px] items-center gap-4 rounded-panel bg-primary-600 px-6 py-4 text-start text-white transition-colors hover:bg-primary-700 disabled:opacity-60" disabled={state === 'saving'} onClick={() => void respond('safe')}>
                <ShieldCheck size={32} aria-hidden="true" className="shrink-0" />
                <span className="font-display text-2xl font-bold">{t('checkin.safe')}</span>
              </button>
              <button className="flex min-h-[84px] items-center gap-4 rounded-panel bg-danger px-6 py-4 text-start text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-60" disabled={state === 'saving'} onClick={() => void respond('needs_help')}>
                <LifeBuoy size={32} aria-hidden="true" className="shrink-0" />
                <span>
                  <span className="block font-display text-2xl font-bold">{t('checkin.help')}</span>
                  <span className="block text-[15px] text-white/85">{t('checkin.helpHint')}</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
