import { Link } from 'react-router-dom';
import { Siren, Search, UserPlus, CloudRain, Eye } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useLang } from '@/lib/i18n';
import { useWeatherWarnings } from '@/hooks/useWeatherWarnings';

export function HomePage() {
  const { t } = useLang();
  const weather = useWeatherWarnings();
  const warnings = weather.data?.warnings ?? [];

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
          <section>
            <h1 className="font-display text-[40px] font-bold leading-[1.05] sm:text-[56px]">{t('home.title')}</h1>
            <p className="mt-4 max-w-[34em] text-lg text-neutral-600">{t('home.lead')}</p>

            <Link to="/report" className="group mt-8 flex items-center gap-4 rounded-panel bg-critical px-5 py-5 text-white transition-colors hover:bg-[#A81F16] sm:px-6">
              <Siren size={30} aria-hidden="true" className="shrink-0" />
              <span>
                <span className="block font-display text-2xl font-bold">{t('home.report')}</span>
                <span className="block text-[15px] text-white/85">{t('home.reportHint')}</span>
              </span>
            </Link>

            <div className="mt-3 divide-y divide-line overflow-hidden rounded-panel border border-line bg-white">
              <Link to="/status" className="flex items-start gap-4 px-5 py-4 hover:bg-neutral-50">
                <Search size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-primary-600" />
                <span><span className="block font-semibold">{t('home.track')}</span><span className="block text-[15px] text-neutral-500">{t('home.trackHint')}</span></span>
              </Link>
              <Link to="/register-at-risk" className="flex items-start gap-4 px-5 py-4 hover:bg-neutral-50">
                <UserPlus size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-primary-600" />
                <span><span className="block font-semibold">{t('home.register')}</span><span className="block text-[15px] text-neutral-500">{t('home.registerHint')}</span></span>
              </Link>
            </div>
          </section>

          <aside className="space-y-4">
            <section className={warnings.length ? 'rounded-panel border border-[#F2C9A8] bg-[#FDF1E7] p-5' : 'rounded-panel border border-line bg-white p-5'} aria-live="polite">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CloudRain size={20} aria-hidden="true" className={warnings.length ? 'text-high' : 'text-primary-600'} />{t('home.warning')}</h2>
              {weather.isLoading && <p className="mt-2 text-neutral-500">…</p>}
              {!weather.isLoading && !warnings.length && <p className="mt-2 text-neutral-600">{weather.error ? t('home.forecastDown') : t('home.noWarning')}</p>}
              {warnings.slice(0, 2).map((warning) => (
                <div key={warning.id} className="mt-3">
                  <p className="font-semibold text-high">{warning.title}</p>
                  <p className="mt-0.5 text-[15px] text-neutral-700">{warning.detail}</p>
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-[15px] text-neutral-700">{warning.instructions.slice(0, 2).map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ))}
              <p className="mt-3 text-[13px] text-neutral-500">{t('home.source')}</p>
            </section>

            <section className="rounded-panel bg-ink p-5 text-white">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Eye size={20} aria-hidden="true" className="text-flood" />{t('home.unseenTitle')}</h2>
              <p className="mt-2 text-[15px] text-[#C9D6D4]">{t('home.unseenBody')}</p>
            </section>
          </aside>
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold">{t('home.after')}</h2>
          <ol className="mt-5 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
            {(['home.step1', 'home.step2', 'home.step3'] as const).map((key, index) => (
              <li key={key} className="bg-white p-5">
                <span className="font-display text-3xl font-bold text-primary-600">{index + 1}</span>
                <p className="mt-2 text-[15px] text-neutral-700">{t(key)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-sm text-neutral-500 sm:px-6">
          <span>{t('home.footer')}</span>
          <Link to="/login" className="font-semibold text-primary-700 hover:underline">{t('nav.signin')}</Link>
        </div>
      </footer>
    </div>
  );
}
