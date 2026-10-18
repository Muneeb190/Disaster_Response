import { Link } from 'react-router-dom';
import { Radio, Siren, ShieldAlert, ArrowRight, Search, Activity, MapPin, Users, Clock } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

export function HomePage() {
  const auth = useAuth();
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
              <Radio size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-800">ResQNet</h1>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest">Disaster Response Platform</p>
            </div>
          </div>
          <Link to={auth.user ? '/portal' : '/login'} className="btn-ghost btn-sm">
            <ShieldAlert size={16} />
            {auth.user ? 'My Workspaces' : 'Sign In'}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-soft" />
            Emergency Response System — Active
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3 tracking-tight">
            Report an Emergency. Get Help Fast.
          </h2>
          <p className="text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            ResQNet connects citizens with emergency coordinators. Submit a report in seconds —
            our system prioritizes incidents by urgency and coordinates rescue teams to where they're needed most.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/report" className="btn-primary btn-lg">
            <Siren size={20} />
            Report an Emergency
          </Link>
          <Link to="/status" className="btn-secondary btn-lg">
            <Search size={20} />
            Check Report Status
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-12">
          <div className="card card-body">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
              <MapPin size={20} className="text-primary-600" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-800 mb-1">Location-Aware</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Pin your exact location on the map so rescue teams can reach you quickly.
            </p>
          </div>
          <div className="card card-body">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-3">
              <Activity size={20} className="text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-800 mb-1">Priority Scoring</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Life-threatening reports are flagged instantly and moved to the top of the queue.
            </p>
          </div>
          <div className="card card-body">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center mb-3">
              <Users size={20} className="text-orange-600" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-800 mb-1">Real-Time Coordination</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Coordinators see your report immediately and assign the nearest suitable team.
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="card border-l-4 border-l-yellow-500 bg-yellow-50/50">
          <div className="p-4 flex items-start gap-3">
            <ShieldAlert size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-neutral-700 font-medium mb-1">Emergency Use Disclaimer</p>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Reports are shared with authorized coordinators. In a real emergency, contact local emergency services directly.
                In a real emergency, always contact your local emergency services number directly.
                This system is designed to support — not replace — official emergency response channels.
              </p>
            </div>
          </div>
        </div>

        {/* Demo info */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400">
          <Clock size={14} />
          <span>Access is protected by role-based permissions</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-neutral-400">ResQNet — Hackathon Demo Project</p>
          <Link to={auth.user ? '/portal' : '/signup'} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
            {auth.user ? 'Open Workspaces' : 'Create Account'} <ArrowRight size={12} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
