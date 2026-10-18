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
  live: { label: 'Live', dot: 'bg-flood' },
  connecting: { label: 'Connecting', dot: 'bg-amber-400 animate-pulse-soft' },
  offline: { label: 'Updates paused', dot: 'bg-critical' },
};

function Sidebar({ realtime, onNavigate }: { realtime: RealtimeStatus; onNavigate?: () => void }) {
  const summary = useDashboardSummary();
  const area = useOperationArea();
  const auth = useAuth();
  const counts = { open: summary.data?.openIncidents, alerts: summary.data?.unacknowledgedAlerts };
  const name = auth.profile?.full_name || auth.profile?.email || 'Coordinator';

  return (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="px-5 pb-5 pt-5"><Link to="/dashboard" onClick={onNavigate}><Wordmark inverted sub="Coordination" /></Link></div>
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Workspace">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-4">
            <p className="px-3 pb-1.5 text-[13px] font-medium text-[#8FA6A3]">{group.heading}</p>
            {group.items.map((item) => {
              const count = item.count ? counts[item.count] : undefined;
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} onClick={onNavigate}
                  className={({ isActive }) => cn('relative flex min-h-[40px] items-center gap-3 rounded-control px-3 text-[15px] transition-colors',
                    isActive ? 'bg-white/10 font-semibold text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-flood' : 'text-[#C9D6D4] hover:bg-white/5 hover:text-white')}>
                  <item.icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {!!count && <span className="rounded-full bg-white/10 px-2 text-[13px] font-semibold">{count}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-white/10 px-5 py-4 text-sm">
        <p className="flex items-start gap-2 text-[#C9D6D4]"><MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{area}</p>
        <p className="flex items-center gap-2 text-[#C9D6D4]"><span className={cn('h-2 w-2 rounded-full', REALTIME[realtime].dot)} aria-hidden="true" />{REALTIME[realtime].label}</p>
        <Link to="/" className="flex items-center gap-2 text-[#C9D6D4] hover:text-white"><Globe size={16} aria-hidden="true" />Public reporting site</Link>
        <div className="flex items-center gap-2 pt-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-bold">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <button type="button" className="rounded-control p-2 text-[#C9D6D4] hover:bg-white/10 hover:text-white" aria-label="Sign out" onClick={() => void auth.signOut()}><LogOut size={17} /></button>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  useForceLtr();
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
        <Sidebar realtime={realtime} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[1500] lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-[284px] max-w-[85vw] animate-fade-in shadow-lift">
            <Sidebar realtime={realtime} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="app-topbar sticky top-0 z-[600] flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:hidden">
          <button type="button" className="rounded-control p-2 hover:bg-neutral-100" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
          <span className="flex-1 truncate font-display text-lg font-semibold">{title}</span>
          <Link to="/alerts" className="relative rounded-control p-2 hover:bg-neutral-100" aria-label={`${unack} unacknowledged alerts`}>
            <Bell size={20} />
            {unack > 0 && <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-critical px-1 text-[12px] font-bold text-white">{unack}</span>}
          </Link>
        </header>

        <main id="workspace" className="app-main mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[30px] font-bold leading-tight">{title}</h1>
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
