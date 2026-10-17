import { CircleDot, HelpCircle, MessageCircleQuestion, ShieldAlert, Gauge, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FACT_STATUS_LABELS } from '@/types';
import type { ConfidenceLevel, FactStatus, Incident } from '@/types';

const STATUS_STYLE: Record<FactStatus, { icon: typeof CircleDot; className: string }> = {
  reported: { icon: CircleDot, className: 'text-neutral-500' },
  followup: { icon: MessageCircleQuestion, className: 'text-primary-600' },
  unknown: { icon: HelpCircle, className: 'text-amber-500' },
};

export function FactStatusIcon({ status, size = 14 }: { status: FactStatus; size?: number }) {
  const { icon: Icon, className } = STATUS_STYLE[status] ?? STATUS_STYLE.reported;
  return (
    <span title={FACT_STATUS_LABELS[status]} className={cn('inline-flex flex-shrink-0', className)}>
      <Icon size={size} />
    </span>
  );
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  high: 'badge-success',
  medium: 'badge-info',
  low: 'badge-warning',
};

export function ConfidenceBadge({ level, score, className }: { level: ConfidenceLevel; score?: number; className?: string }) {
  return (
    <span className={cn(CONFIDENCE_STYLE[level], className)} title="How well supported the information is. Not how dangerous it is.">
      {level[0].toUpperCase() + level.slice(1)} confidence{score !== undefined ? ` · ${score}` : ''}
    </span>
  );
}

export function UrgentCheckBadge({ className }: { className?: string }) {
  return (
    <span className={cn('badge-critical', className)} title="Serious but uncertain: check urgently, do not deprioritise">
      <ShieldAlert size={11} className="inline -mt-0.5 mr-0.5" /> Urgent check
    </span>
  );
}

// Feature 13: the reasons behind the score, plus the facts that are still unknown.
export function WhyPriorityPanel({ incident }: { incident: Incident }) {
  const factors = incident.risk_factors ?? [];
  const scoring = factors.filter((f) => f.points > 0);
  const gaps = factors.filter((f) => f.status === 'unknown');

  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <p className="text-xs font-medium text-neutral-500 mb-2 flex items-center gap-1.5">
        <Zap size={12} /> Why this priority
      </p>
      {scoring.length > 0 ? (
        <ul className="space-y-1.5">
          {scoring.map((f) => (
            <li key={f.key} className="text-xs text-neutral-700 flex items-start gap-2">
              <FactStatusIcon status={f.status} />
              <span className="flex-1">
                {f.label}
                <span className="text-neutral-400"> · {FACT_STATUS_LABELS[f.status]}</span>
              </span>
              <span className="font-semibold text-neutral-600">+{f.points}</span>
            </li>
          ))}
          <li className="text-xs text-neutral-500 flex justify-between border-t border-neutral-200 pt-1.5">
            <span>Total (capped at 100)</span>
            <span className="font-semibold text-neutral-700">{incident.priority_score}</span>
          </li>
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">No danger factors reported yet.</p>
      )}
      {gaps.length > 0 && (
        <div className="mt-3 pt-2 border-t border-neutral-200">
          <p className="text-[11px] font-medium text-amber-700 mb-1">Not yet known (treated as "cannot assume safe")</p>
          <ul className="space-y-1">
            {gaps.map((f) => (
              <li key={f.key} className="text-xs text-neutral-600 flex items-start gap-2">
                <FactStatusIcon status="unknown" /> {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Feature 14: how well supported the information is, with every reason.
export function ConfidencePanel({ incident }: { incident: Incident }) {
  return (
    <div className="card card-body">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
          <Gauge size={14} /> Information confidence
        </h3>
        <ConfidenceBadge level={incident.confidence_level} score={incident.confidence_score} />
      </div>
      <ul className="space-y-1">
        {(incident.confidence_reasons ?? []).map((r, i) => (
          <li key={i} className="text-xs text-neutral-600 flex items-center justify-between gap-2">
            <span>{r.label}</span>
            <span className={cn('font-medium', r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-600' : 'text-neutral-400')}>
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </span>
          </li>
        ))}
      </ul>
      {incident.needs_urgent_check ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2 mt-3 flex items-start gap-1.5">
          <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
          Serious but uncertain. Check urgently. Low confidence never lowers the priority.
        </p>
      ) : (
        <p className="text-[11px] text-neutral-400 mt-3">Confidence shows how well supported the report is, not how dangerous it is.</p>
      )}
    </div>
  );
}
