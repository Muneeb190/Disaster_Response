import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Radio, ArrowLeft, Search, Check, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { useAppendIncidentDetails, useIncidentByReportCode } from '@/hooks/useData';
import { PriorityBadge, StatusBadge, VerificationBadge, TriStateBadge } from '@/components/ui/Badges';
import { INCIDENT_TYPE_LABELS } from '@/types';
import { LoadingSpinner, EmptyState } from '@/components/ui/States';
import { timeAgo, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast-context';
import { PublicShelterSuggestions } from '@/components/incident/PublicShelterSuggestions';
import { SafetyGuidance } from '@/components/incident/SafetyGuidance';
import { EvidenceUploader } from '@/components/incident/EvidenceUploader';

export function ReportStatusPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const initialCode = (params.get('code') ?? '').toUpperCase();
  const [code, setCode] = useState(initialCode);
  const [trackingToken, setTrackingToken] = useState(() => initialCode ? sessionStorage.getItem(`resqnet_tracking_${initialCode}`) ?? '' : '');
  const [searched, setSearched] = useState(Boolean(initialCode && (trackingToken || auth.user)));
  const [additionalDetails, setAdditionalDetails] = useState('');
  const appendDetails = useAppendIncidentDetails();

  const { data: incident, isFetching } = useIncidentByReportCode(searched ? code : '', searched ? trackingToken : '');

  const addDetails = async () => {
    try {
      await appendDetails.mutateAsync({ reportCode: code, trackingToken, details: additionalDetails });
      setAdditionalDetails('');
      toast('Your additional information was sent to coordinators.', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not add details', 'error'); }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Radio size={18} className="text-white" />
            </div>
            <span className="font-bold text-neutral-800">ResQNet</span>
          </Link>
          <Link to="/" className="btn-ghost btn-sm">
            <ArrowLeft size={16} /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-neutral-800 mb-1">Check Report Status</h1>
        <p className="text-sm text-neutral-500 mb-6">Enter your report ID and private tracking key. Signed-in users can open reports submitted from their account without the key.</p>

        {/* Search */}
        <div className="card card-body mb-6">
          <div className="space-y-3">
            <input
              className="input"
              placeholder="e.g., RN-000001"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim() && (trackingToken.trim() || auth.user)) setSearched(true);
              }}
            />
            <input
              className="input"
              placeholder="Private tracking key"
              value={trackingToken}
              onChange={(e) => setTrackingToken(e.target.value.trim())}
            />
            <button
              className="btn-primary w-full justify-center"
              onClick={() => setSearched(true)}
              disabled={!code.trim() || (!trackingToken.trim() && !auth.user) || isFetching}
            >
              {isFetching ? <LoadingSpinner size={16} /> : <Search size={18} />}
              Search
            </button>
          </div>
        </div>

        {/* Results */}
        {searched && (
          <>
            {isFetching && (
              <div className="card card-body flex justify-center">
                <LoadingSpinner size={24} />
              </div>
            )}

            {!isFetching && !incident && (
              <div className="card">
                <EmptyState
                  icon={<Search size={40} />}
                  title="Report Not Found"
                  message={`No report found with ID "${code}". Please check and try again.`}
                />
              </div>
            )}

            {!isFetching && incident && (
              <>
              <div className="card card-body space-y-4 animate-fade-in">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-200">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-bold text-primary-700">{incident.report_code}</code>
                      <VerificationBadge status={incident.verification_status} />
                    </div>
                    <p className="text-xs text-neutral-400">Reported {timeAgo(incident.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <PriorityBadge level={incident.priority_level} />
                    <StatusBadge status={incident.status} />
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-400 w-24">Type</span>
                    <span className="font-medium">{INCIDENT_TYPE_LABELS[incident.type]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-400 w-24">People</span>
                    <span className="font-medium">{incident.people_affected} affected</span>
                  </div>
                  {incident.area_landmark && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-neutral-400" />
                      <span className="font-medium">{incident.area_landmark}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-xs text-neutral-400 mb-1">Description</p>
                  <p className="text-sm text-neutral-700">{incident.description}</p>
                </div>

                {/* Status indicators */}
                <div>
                  <p className="text-xs text-neutral-400 mb-2">Reported Conditions</p>
                  <div className="flex flex-wrap gap-2">
                    <TriStateBadge value={incident.people_trapped} label="Trapped" />
                    <TriStateBadge value={incident.injuries_reported} label="Injuries" />
                    <TriStateBadge value={incident.vulnerable_people} label="Vulnerable" />
                    <TriStateBadge value={incident.danger_increasing} label="Worsening" />
                  </div>
                </div>

                {/* Priority score */}
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-blue-700">Priority Score</p>
                    <span className="text-lg font-bold text-blue-800">{incident.priority_score}/100</span>
                  </div>
                  <ul className="space-y-1">
                    {incident.priority_reasons.map((reason, i) => (
                      <li key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                        <Check size={12} className="flex-shrink-0 mt-0.5" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                {incident.life_threatening && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg p-2">
                    <AlertTriangle size={14} />
                    Flagged for urgent coordinator review: immediate danger to life reported.
                  </div>
                )}

                <div className="rounded-lg border border-neutral-200 p-3">
                  <label className="label">Add information to this report</label>
                  <textarea className="input resize-none" rows={3} value={additionalDetails} onChange={(event) => setAdditionalDetails(event.target.value)} placeholder="New danger, people affected, access instructions, or another useful update" />
                  <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-neutral-500">The original report stays in the history.</p><button className="btn-primary btn-sm" disabled={additionalDetails.trim().length < 5 || appendDetails.isPending} onClick={() => void addDetails()}>{appendDetails.isPending ? <LoadingSpinner size={14} /> : 'Send update'}</button></div>
                </div>

                <p className="text-xs text-neutral-400 flex items-center gap-1">
                  <Clock size={12} />
                  Last updated {formatDateTime(incident.updated_at)}
                </p>
              </div>
              <div className="mt-4 space-y-4">
                {trackingToken && <EvidenceUploader reportCode={incident.report_code} trackingToken={trackingToken} />}
                <PublicShelterSuggestions reportCode={incident.report_code} trackingToken={trackingToken} vulnerable={incident.vulnerable_people === 'yes'} />
                <SafetyGuidance type={incident.type} />
              </div>
              </>
            )}
          </>
        )}

        <div className="mt-6 text-center">
          <Link to="/report" className="text-sm text-primary-600 hover:underline">
            Submit a new report →
          </Link>
        </div>
      </main>
    </div>
  );
}
