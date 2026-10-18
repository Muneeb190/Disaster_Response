import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, ListFilter, Radio, RadioTower, House, Package, Bell, BellRing, ClipboardList, History, FileText, UserCog, LogOut, Globe, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeSync, type RealtimeStatus } from '@/hooks/useRealtime';
import { useDashboardSummary, useDemoPresence } from '@/hooks/useData';
import { useOperationArea } from '@/lib/region';
import { useAuth } from '@/auth/AuthContext';
import { DemoBadge } from '@/components/ui/Badges';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: ListFilter, count: 'open' as const },
  { to: '/alerts', label: 'Alerts', icon: BellRing, count: 'alerts' as const },
  { to: '/assignments', label: 'Assignments', icon: ClipboardList },
  { to: '/teams', label: 'Teams', icon: RadioTower },
  { to: '/resources', label: 'Resources', icon: Package },
  { to: '/shelters', label: 'Shelters', icon: House },
  { to: '/activity', label: 'Activity history', icon: History },
  { to: '/reports/summary', label: 'Situation report', icon: FileText },
  { to: '/admin/users', label: 'Users & roles', icon: UserCog },
];

export function DashboardSidebar() {
  const summary = useDashboardSummary();
  const area = useOperationArea();
  const counts = { open: summary.data?.openIncidents, alerts: summary.data?.unacknowledgedAlerts };

  return (
    <aside className="command-sidebar">
      <div className="command-brand">
        <div className="command-logo"><Radio size={19} /></div>
        <div>
          <h1>RESQNET</h1>
          <p>Response workspace</p>
        </div>
      </div>

      <nav className="command-nav">
        {navItems.map((item) => {
          const count = item.count ? counts[item.count] : undefined;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} className={({ isActive }) => cn('command-nav-link', isActive && 'command-nav-link-active')}>
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {!!count && <span className="command-nav-count">{count}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="command-operation">
        <p className="command-overline">Operation area</p>
        <div className="flex items-start gap-2 text-[12px] text-slate-200"><MapPin size={13} className="mt-0.5 shrink-0" /> {area}</div>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          {summary.data ? <>{summary.data.openIncidents} open · {summary.data.criticalIncidents} critical<br />{summary.data.activeAssignments} active assignments</> : 'Loading…'}
        </p>
      </div>
      <Link to="/" className="command-help"><Globe size={15} /> Public reporting site</Link>
    </aside>
  );
}

const REALTIME_LABELS: Record<RealtimeStatus, string> = { live: 'Live updates on', connecting: 'Connecting…', offline: 'Live updates offline' };

export function DashboardTopBar({ title, subtitle, realtime, children }: { title: string; subtitle?: string; realtime: RealtimeStatus; children?: React.ReactNode }) {
  const auth = useAuth();
  const area = useOperationArea();
  const demo = useDemoPresence();
  const summary = useDashboardSummary();
  const unack = summary.data?.unacknowledgedAlerts ?? 0;
  const initials = (auth.profile?.full_name || auth.profile?.email || 'Admin').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <header className="command-topbar">
      <div className="flex items-center gap-4 min-w-0">
        <div className="command-secondary-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
        <span className="command-divider" />
        <span className="command-location truncate"><MapPin size={14} /> {area}</span>
        {demo.data && <DemoBadge />}
      </div>
      <div className="flex items-center gap-4">
        {children}
        <span className={cn('command-operational', realtime !== 'live' && 'text-amber-700')} title="Realtime connection to the database"><span className={realtime === 'live' ? '' : 'bg-amber-500'} /> {REALTIME_LABELS[realtime]}</span>
        <Link to="/alerts" className="relative text-slate-600 hover:text-slate-900" title={`${unack} unacknowledged alerts`}>
          <Bell size={17} />
          {unack > 0 && <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center">{unack}</span>}
        </Link>
        <span className="command-divider hidden md:block" />
        <div className="command-user"><span>{initials}</span><strong>{auth.profile?.full_name || 'Administrator'}</strong></div>
        <button className="text-slate-500 hover:text-slate-800" title="Sign out" onClick={() => void auth.signOut()}><LogOut size={16} /></button>
      </div>
    </header>
  );
}

export function DashboardLayout({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const realtime = useRealtimeSync();
  return (
    <div className="command-app" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', minHeight: '100vh' }}>
      {/* Sidebar occupies its own grid column and spans the full height independently */}
      <DashboardSidebar />
      {/* Content column: topbar + main, only within this column */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <DashboardTopBar title={title} subtitle={subtitle} realtime={realtime}>{actions}</DashboardTopBar>
        <main className="command-main" style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
      </div>
    </div>
  );
}
