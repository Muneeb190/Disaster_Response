import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListFilter, Activity, Radio, Map, RadioTower, House, MessageSquare, FileText, Bell, ChevronDown, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtime';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: ListFilter },
  { to: '/dashboard', label: 'Response map', icon: Map },
  { to: '/teams', label: 'Teams & resources', icon: RadioTower },
  { to: '/resources', label: 'Shelters', icon: House },
  { to: '/assignments', label: 'Communications', icon: MessageSquare },
  { to: '/incidents', label: 'Reports', icon: FileText },
];

export function DashboardSidebar() {
  const location = useLocation();

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
        {navItems.map((item, index) => {
          const isActive = index === 0
            ? location.pathname === '/dashboard'
            : item.to === '/incidents' && location.pathname.startsWith('/incidents');
          return (
            <NavLink key={`${item.label}-${item.to}`} to={item.to} className={cn('command-nav-link', isActive && 'command-nav-link-active')}>
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.label === 'Incidents' && <span className="command-nav-count">{12}</span>}
              {item.label === 'Communications' && <span className="command-nav-count">4</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="command-operation">
        <p className="command-overline">Active operation</p>
        <div className="flex items-center gap-2 text-[12px] text-slate-200"><span className="command-status-dot command-status-dot-amber" /> River flood response</div>
        <p className="command-mono mt-3">SAC-FL-2026-042</p>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">Operational period 03 06:00<br />–18:00 PDT</p>
      </div>

      <div className="command-handover">
        <p className="command-overline">Next handover</p>
        <strong>18:00</strong>
        <span>View shift briefing <Activity size={13} /></span>
      </div>
      <NavLink to="/" className="command-help"><HelpCircle size={15} /> Help & protocols</NavLink>
    </aside>
  );
}

export function DashboardTopBar({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="command-topbar">
      <div className="flex items-center gap-4 min-w-0">
        {title !== 'Command Center Dashboard' && <div className="command-secondary-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>}
        <div className="command-top-logo"><Radio size={15} /></div>
        <span className="command-top-brand">FIELDWORK</span>
        <span className="command-divider" />
        <span className="command-location">Sacramento County EOC <ChevronDown size={14} /></span>
        <span className="command-level"><span /> LEVEL 2 · PARTIAL ACTIVATION</span>
      </div>
      <div className="flex items-center gap-4">
        {children}
        <span className="command-operational"><span /> Systems operational</span>
        <Bell size={17} className="text-slate-600" />
        <span className="command-divider hidden md:block" />
        <div className="command-user"><span>AM</span><strong>A. Martinez</strong><ChevronDown size={13} /></div>
      </div>
      <span className="sr-only">{title} {subtitle}</span>
    </header>
  );
}

export function DashboardLayout({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  useRealtimeSync();
  return (
    <div className="command-app flex min-h-screen">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title={title} subtitle={subtitle}>{actions}</DashboardTopBar>
        <main className="command-main flex-1">{children}</main>
      </div>
    </div>
  );
}
