import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, ListOrdered, BellRing, ClipboardList, RadioTower, Package, House, Eye, Route, History, FileText, UserCog, LogOut, Globe, MapPin, Menu, Bell, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeSync, type RealtimeStatus } from '@/hooks/useRealtime';
import { useDashboardSummary, useDemoPresence } from '@/hooks/useData';
import { useOperationArea } from '@/lib/region';
import { useAuth } from '@/auth/AuthContext';
import { useForceLtr } from '@/lib/i18n';
import { DemoBadge } from '@/components/ui/Badges';
import { Wordmark } from '@/components/brand/Brand';

type NavItem = { to: string; label: string; icon: LucideIcon; count?: 'open' | 'alerts' };

// Grouped by the three questions in the brief, so the workspace reads as the plan it serves.
const NAV: { heading: string; items: NavItem[] }[] = [
  { heading: 'Command', items: [
    { to: '/dashboard', label: 'Overview', icon: LayoutGrid },
    { to: '/incidents', label: 'Incidents', icon: ListOrdered, count: 'open' },
    { to: '/alerts', label: 'Alerts', icon: BellRing, count: 'alerts' },
  ] },
  { heading: 'Who is most at risk', items: [
    { to: '/vulnerability', label: 'Vulnerability & warnings', icon: Eye },
  ] },
  { heading: 'Who gets help first', items: [
    { to: '/planning', label: 'Dispatch & early action', icon: Route },
    { to: '/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/teams', label: 'Teams', icon: RadioTower },
    { to: '/resources', label: 'Resources', icon: Package },
    { to: '/shelters', label: 'Shelters', icon: House },
  ] },
  { heading: 'Records', items: [
    { to: '/activity', label: 'Activity history', icon: History },
    { to: '/reports/summary', label: 'Situation report', icon: FileText },
    { to: '/admin/users', label: 'Users & roles', icon: UserCog },
  ] },
];

const REALTIME: Record<RealtimeStatus, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-flood shadow-[0_0_8px_rgb(var(--flood))]' },
  connecting: { label: 'Connecting', dot: 'bg-amber-400 animate-pulse-soft' },
  offline: { label: 'Updates paused', dot: 'bg-critical' },
};

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const summary = useDashboardSummary();
  const area = useOperationArea();
  const auth = useAuth();
  const counts = { open: summary.data?.openIncidents, alerts: summary.data?.unacknowledgedAlerts };
  const name = auth.profile?.full_name || auth.profile?.email || 'Coordinator';

  return (
    <div className="flex h-full flex-col border-r border-line bg-surface">
      <div className="px-5 pb-6 pt-5"><Link to="/dashboard" onClick={onNavigate}><Wordmark sub="Command console" /></Link></div>
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Workspace">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="px-3 pb-2 text-[12px] font-semibold text-neutral-400">{group.heading}</p>
            {group.items.map((item) => {
              const count = item.count ? counts[item.count] : undefined;
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} onClick={onNavigate}
                  className={({ isActive }) => cn('group relative flex min-h-[40px] items-center gap-3 rounded-control px-3 text-[15px] transition-colors',
                    isActive ? 'bg-primary-50 font-semibold text-primary-800 shadow-[inset_0_0_0_1px_rgb(var(--primary-600)/0.25)]' : 'text-neutral-600 hover:bg-neutral-100 hover:text-ink')}>
                  {({ isActive }) => <>
                    <item.icon size={18} strokeWidth={2} aria-hidden="true" className={isActive ? 'text-primary-600' : 'text-neutral-400 group-hover:text-ink'} />
                    <span className="flex-1">{item.label}</span>
                    {!!count && <span className={cn('rounded-full px-2 text-[12px] font-bold', item.count === 'alerts' ? 'bg-critical-soft text-critical' : 'bg-neutral-100 text-neutral-600')}>{count}</span>}
                  </>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line px-5 py-4 text-sm text-neutral-500">
        <p className="flex items-start gap-2"><MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{area}</p>
        <Link to="/" className="flex items-center gap-2 hover:text-ink"><Globe size={16} aria-hidden="true" />Public reporting site</Link>
        <div className="flex items-center gap-2.5 pt-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-800">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{name}</span>
          <button type="button" className="rounded-control p-2 hover:bg-neutral-100 hover:text-ink" aria-label="Sign out" onClick={() => void auth.signOut()}><LogOut size={17} /></button>
        </div>
      </div>
    </div>
  );
}

// The console is dark; public screens stay light. Applied to <html> so modals, toasts and map popups follow.
function useConsoleTheme() {
  useEffect(() => {
    document.documentElement.classList.add('theme-dark');
    return () => document.documentElement.classList.remove('theme-dark');
  }, []);
}

export function DashboardLayout({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  useForceLtr();
  useConsoleTheme();
  const realtime = useRealtimeSync();
  const demo = useDemoPresence();
  const summary = useDashboardSummary();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const unack = summary.data?.unacknowledgedAlerts ?? 0;
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [drawer]);

  return (
    <div className="app-shell min-h-screen bg-paper lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a href="#workspace" className="skip-link">Skip to content</a>
      <aside className="app-sidebar sticky top-0 hidden h-screen lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[1500] lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-[284px] max-w-[85vw] animate-fade-in shadow-lift">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="app-topbar sticky top-0 z-[600] flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <button type="button" className="rounded-control p-2 hover:bg-neutral-100" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
          <span className="flex-1 truncate font-display text-lg font-semibold">{title}</span>
          <Link to="/alerts" className="relative rounded-control p-2 hover:bg-neutral-100" aria-label={`${unack} unacknowledged alerts`}>
            <Bell size={20} />
            {unack > 0 && <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[12px] font-bold text-white">{unack}</span>}
          </Link>
        </header>

        <main id="workspace" className="app-main mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[13px] font-semibold text-neutral-500"><span className={cn('h-2 w-2 rounded-full', REALTIME[realtime].dot)} aria-hidden="true" />{REALTIME[realtime].label}</span>
                {demo.data && <DemoBadge />}
              </div>
              {subtitle && <p className="mt-1 max-w-[60em] text-neutral-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
