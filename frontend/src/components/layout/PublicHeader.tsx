import { Link } from 'react-router-dom';
import { LogOut, Phone } from 'lucide-react';
import { Wordmark } from '@/components/brand/Brand';
import { useAuth } from '@/auth/AuthContext';
import { useLang } from '@/lib/i18n';

export function PublicHeader() {
  const { t, lang, setLang } = useLang();
  const auth = useAuth();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="bg-ink text-paper">
        <p className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
          <Phone size={15} aria-hidden="true" className="shrink-0 text-flood" />
          {t('call.banner')}
        </p>
      </div>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="ResQNet home"><Wordmark sub={t('brand.place')} /></Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <Link to="/status" className="btn-ghost btn-sm hidden sm:inline-flex">{t('nav.track')}</Link>
            <button
              type="button"
              className="btn-secondary btn-sm min-w-[64px]"
              onClick={() => setLang(lang === 'en' ? 'ur' : 'en')}
              lang={lang === 'en' ? 'ur' : 'en'}
              aria-label={lang === 'en' ? 'اردو میں دیکھیں' : 'View in English'}
            >
              {t('lang.other')}
            </button>
            <Link to={auth.user ? '/portal' : '/login'} className="btn-ghost btn-sm hidden md:inline-flex">
              {auth.user ? t('nav.workspace') : t('nav.signin')}
            </Link>
            {auth.user && <button type="button" className="btn-ghost btn-sm" onClick={() => void auth.signOut()}><LogOut size={16} aria-hidden="true" /><span className="hidden sm:inline">{t('nav.signout')}</span><span className="sr-only sm:hidden">{t('nav.signout')}</span></button>}
          </nav>
        </div>
      </header>
    </>
  );
}
