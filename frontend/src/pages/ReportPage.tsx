import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, MapPin, Sparkles, AlertCircle, Search, MessageCircleQuestion, ChevronDown, Camera, Waves, Flame, HeartPulse, ThermometerSun, TriangleAlert, Send, User, Users, type LucideIcon } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { useLang } from '@/lib/i18n';
import { LocationPicker } from '@/components/map/IncidentMap';
import { useCreateIncident, type CreateIncidentInput } from '@/hooks/useData';
import { useToast } from '@/components/ui/toast-context';
import { LoadingSpinner } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { pickFollowupQuestion, type FollowupQuestion } from '@/lib/followup';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { reverseGeocode } from '@/lib/geocoding';
import type { IncidentType, TriState, VoiceTranscription } from '@/types';
import { lowDataEnabled, queueOffline } from '@/lib/offlineSync';
import { uploadIncidentPhoto } from '@/lib/evidence';
import { PublicShelterSuggestions } from '@/components/incident/PublicShelterSuggestions';
import { SafetyGuidance } from '@/components/incident/SafetyGuidance';
import { EvidenceUploader } from '@/components/incident/EvidenceUploader';

const schema = z.object({
  type: z.enum(['flood', 'fire', 'medical_emergency', 'heatwave', 'other']),
  description: z.string().min(10, 'Please describe the situation (at least 10 characters)'),
  area_landmark: z.string().optional(),
  people_affected: z.number({ error: 'Enter the number of people affected' }).int('Enter a whole number').min(0, 'Cannot be negative'),
  people_trapped: z.enum(['yes', 'no', 'unknown']),
  injuries_reported: z.enum(['yes', 'no', 'unknown']),
  vulnerable_people: z.enum(['yes', 'no', 'unknown']),
  danger_increasing: z.enum(['yes', 'no', 'unknown']),
  reporter_name: z.string().optional(),
  reporter_phone: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const incidentTypes: { value: IncidentType; Icon: LucideIcon }[] = [
  { value: 'flood', Icon: Waves },
  { value: 'fire', Icon: Flame },
  { value: 'medical_emergency', Icon: HeartPulse },
  { value: 'heatwave', Icon: ThermometerSun },
  { value: 'other', Icon: TriangleAlert },
];

const NEEDS = ['elderly', 'child', 'disabled', 'pregnant', 'cannot_walk', 'wheelchair', 'bedbound', 'chronic_condition', 'needs_medicine', 'oxygen_dependency', 'dialysis', 'lives_alone', 'no_phone', 'power_dependency', 'limited_transport'] as const;

export function ReportPage() {
  const { toast } = useToast();
  const { t } = useLang();
  const createIncident = useCreateIncident();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);
  const [submittedType, setSubmittedType] = useState<IncidentType>('other');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoResult, setPhotoResult] = useState<'uploaded' | 'failed' | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, unknown> | null>(null);
  // Feature 12: at most one follow-up question, always skippable.
  const [followup, setFollowup] = useState<{ q: FollowupQuestion; data: FormData } | null>(null);
  const [voiceResult, setVoiceResult] = useState<VoiceTranscription | null>(null);
  const [voiceRecordingId, setVoiceRecordingId] = useState<string | null>(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [moreDetails, setMoreDetails] = useState(false);
  const [proxyReport, setProxyReport] = useState(false);
  const [proxyRelationship, setProxyRelationship] = useState('');
  const [vulnerabilityFlags, setVulnerabilityFlags] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'flood',
      people_affected: 1,
      people_trapped: 'unknown',
      injuries_reported: 'unknown',
      vulnerable_people: 'unknown',
      danger_increasing: 'unknown',
    },
  });

  const description = watch('description');

  const selectLocation = async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setLocationName('Identifying area…');
    try {
      const name = await reverseGeocode(lat, lng);
      setLocationName(name);
      if (!watch('area_landmark')) setValue('area_landmark', name, { shouldDirty: true });
    } catch {
      setLocationName('Selected location');
    }
  };
  const applyVoiceResult = (result: VoiceTranscription) => {
    setVoiceResult(result);
    setValue('description', result.english_translation || result.transcript, { shouldValidate: true });
    setValue('type', result.incident_category);
    if (result.people_affected !== null) setValue('people_affected', result.people_affected);
    for (const field of ['people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'] as const) {
      if (result[field] !== 'unknown') setValue(field, result[field]);
    }
    setAiResults(result as unknown as Record<string, unknown>);
    if (result.vulnerability_flags?.length) setVulnerabilityFlags(result.vulnerability_flags);
  };

  const handleVoiceTranscript = (transcript: string, analysis?: VoiceTranscription | null) => {
    if (analysis) applyVoiceResult(analysis);
    else setValue('description', transcript, { shouldValidate: true });
  };

  const handleAiExtract = async () => {
    if (!description || description.length < 10) {
      toast('Please enter a description first', 'warning');
      return;
    }
    setAiExtracting(true);
    setAiError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-extract`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `AI service unavailable (${res.status})`);
      }
      const data = await res.json();
      setAiResults(data);
      toast('AI analysis complete. Review and confirm the extracted fields.', 'success');

      // Pre-fill form fields from AI results (user can still edit). "Unknown" never overwrites an answer.
      for (const field of ['people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'] as const) {
        if (data[field] === 'yes' || data[field] === 'no') setValue(field, data[field]);
      }
      if (data.incident_category) {
        const cat = data.incident_category as IncidentType;
        if (['flood', 'fire', 'medical_emergency', 'heatwave', 'other'].includes(cat)) {
          setValue('type', cat);
        }
      }
      if (data.people_affected && typeof data.people_affected === 'number') {
        setValue('people_affected', data.people_affected);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed');
      toast('AI analysis unavailable — you can fill the form manually', 'warning');
    } finally {
      setAiExtracting(false);
    }
  };

  const onSubmit = (data: FormData) => {
    if (!coords) {
      toast('Please pin your location on the map', 'error');
      return;
    }
    const q = pickFollowupQuestion(data.type, data);
    if (q) {
      setFollowup({ q, data });
      return;
    }
    void submitReport(data, null);
  };

  // answer === null means the reporter skipped the question; the report is still sent.
  const answerFollowup = (answer: TriState | null) => {
    if (!followup) return;
    const { q, data } = followup;
    setFollowup(null);
    if (answer) setValue(q.field, answer);
    void submitReport(answer ? { ...data, [q.field]: answer } : data, { question: q.question, field: q.field, answer });
  };

  const submitReport = async (data: FormData, asked: { question: string; field: string; answer: TriState | null } | null) => {
    if (!coords) return;
    try {
      const clientSessionId = localStorage.getItem('resqnet_reporter_session') || crypto.randomUUID();
      localStorage.setItem('resqnet_reporter_session', clientSessionId);
      const reportInput: CreateIncidentInput = {
        type: data.type,
        description: data.description,
        area_landmark: data.area_landmark,
        people_affected: data.people_affected,
        people_trapped: data.people_trapped,
        injuries_reported: data.injuries_reported,
        vulnerable_people: data.vulnerable_people,
        danger_increasing: data.danger_increasing,
        latitude: coords.lat,
        longitude: coords.lng,
        reporter_name: data.reporter_name,
        reporter_phone: data.reporter_phone,
        ai_extracted: { ...(aiResults ?? {}), client_session_id: clientSessionId },
        followup_question: asked?.question ?? null,
        followup_field: asked?.field ?? null,
        followup_answer: asked?.answer ?? null,
        followup_skipped: asked !== null && asked.answer === null,
        input_mode: voiceResult ? 'voice' : 'text',
        voice_transcript: voiceResult ? (voiceResult.english_translation || voiceResult.transcript) : null,
        transcript_language: voiceResult?.language ?? null,
        transcript_english: voiceResult ? (voiceResult.english_translation || voiceResult.transcript) : null,
        voice_recording_id: voiceRecordingId,
        is_proxy_report: proxyReport,
        proxy_relationship: proxyRelationship,
        vulnerability_flags: vulnerabilityFlags,
      };
      if (!navigator.onLine) {
        const queuedId = await queueOffline('public_report', reportInput as unknown as Record<string, unknown>, photo ?? undefined);
        setSubmittedType(data.type); setSubmittedCode('QUEUED-OFFLINE'); setSubmittedToken(queuedId);
        toast('Report saved securely on this device and will send automatically when connected', 'success');
        return;
      }
      const incident = await createIncident.mutateAsync(reportInput);
      setSubmittedType(data.type);
      if (photo && !lowDataEnabled()) {
        try {
          await uploadIncidentPhoto(photo, incident.report_code, incident.tracking_token);
          setPhotoResult('uploaded');
        } catch (photoError) {
          setPhotoResult('failed');
          toast(photoError instanceof Error ? photoError.message : 'The report was received, but the photo could not be uploaded', 'warning');
        }
      }
      if (photo && lowDataEnabled()) { await queueOffline('photo_upload',{report_code:incident.report_code,tracking_token:incident.tracking_token},photo); toast('Low-data mode sent the text first; the photo will upload later', 'warning'); }
      setSubmittedCode(incident.report_code);
      setSubmittedToken(incident.tracking_token);
      sessionStorage.setItem(`resqnet_tracking_${incident.report_code}`, incident.tracking_token);
      toast('Emergency report submitted successfully', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to submit report', 'error');
    }
  };


  if (submittedCode) {
    const copy = (value: string, what: string) => { void navigator.clipboard.writeText(value); toast(`${what} copied`, 'success'); };
    return (
      <div className="min-h-screen bg-paper">
        <PublicHeader />
        <main id="main" className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
          <section className="card card-body">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#E1F0E8] text-success"><Check size={24} aria-hidden="true" /></span>
              <h1 className="text-3xl font-bold">{t('report.done')}</h1>
            </div>
            <p className="mt-3 text-neutral-600">{t('report.doneBody')}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-line p-4">
                <dt className="text-sm text-neutral-500">{t('report.id')}</dt>
                <dd className="mt-1 flex items-center justify-between gap-2" lang="en"><span className="font-display text-2xl font-bold">{submittedCode}</span><button type="button" className="btn-ghost btn-sm" onClick={() => copy(submittedCode, 'Report ID')}><Copy size={16} aria-hidden="true" />{t('report.copy')}</button></dd>
              </div>
              <div className="rounded-control border border-line p-4">
                <dt className="text-sm text-neutral-500">{t('report.key')}</dt>
                <dd className="mt-1 flex items-center justify-between gap-2" lang="en"><span className="break-all font-mono text-sm">{submittedToken}</span>{submittedToken && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => copy(submittedToken, 'Tracking key')}><Copy size={16} aria-hidden="true" />{t('report.copy')}</button>}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link to={`/status?code=${encodeURIComponent(submittedCode)}`} className="btn-primary"><Search size={18} aria-hidden="true" />{t('report.trackIt')}</Link>
              <Link to="/" className="btn-secondary">{t('report.backHome')}</Link>
            </div>
          </section>
          {photoResult === 'uploaded' && <p className="rounded-control border border-[#BFDCCB] bg-[#E1F0E8] p-3 text-sm text-success">Your photo was stored privately for response staff.</p>}
          {photoResult === 'failed' && <p className="rounded-control border border-[#EBD9A6] bg-[#F8EDCF] p-3 text-sm text-moderate">Your report was received, but the photo was not uploaded. You can try again below.</p>}
          {submittedToken && <EvidenceUploader reportCode={submittedCode} trackingToken={submittedToken} />}
          {submittedToken && <PublicShelterSuggestions reportCode={submittedCode} trackingToken={submittedToken} vulnerable={watch('vulnerable_people') === 'yes' || vulnerabilityFlags.length > 0} />}
          <SafetyGuidance type={submittedType} />
        </main>
      </div>
    );
  }

  const type = watch('type');
  const toggleNeed = (value: string, on: boolean) => setVulnerabilityFlags((current) => on ? [...new Set([...current, value])] : current.filter((item) => item !== value));

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-32 pt-8 sm:px-6">
        <h1 className="text-4xl font-bold">{t('report.title')}</h1>
        <p className="mt-2 text-neutral-600">{t('report.lead')}</p>

        <form id="report-form" onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <Step n={1} title={t('report.what')}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label={t('report.what')}>
              {incidentTypes.map(({ value, Icon }) => (
                <button key={value} type="button" aria-pressed={type === value} onClick={() => setValue('type', value)}
                  className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-control border-2 px-2 py-3 text-center text-sm font-semibold transition-colors ${type === value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-neutral-300'}`}>
                  <Icon size={24} aria-hidden="true" />
                  {t(`type.${value}`)}
                </button>
              ))}
            </div>
            <input type="hidden" {...register('type')} />
          </Step>

          <Step n={2} title={t('report.describe')} hint={t('report.describeHint')}
            aside={<button type="button" className="btn-ghost btn-sm text-primary-700" onClick={handleAiExtract} disabled={aiExtracting}>{aiExtracting ? <LoadingSpinner size={14} /> : <Sparkles size={15} aria-hidden="true" />}Fill the form from my words</button>}>
            <VoiceRecorder
              description={description ?? ''}
              onTranscript={handleVoiceTranscript}
              onRecordingId={(id) => {
                setVoiceRecordingId(id);
                if (id && (!description || description.trim().length < 10)) setValue('description', 'Voice emergency report — transcription is still processing.', { shouldValidate: true });
              }}
              onUploadingChange={setVoiceUploading}
              onLocalAudioSaved={() => toast('Audio was saved on this device only. It has not reached rescuers.', 'warning')}
            />
            <label htmlFor="description" className="sr-only">{t('report.describe')}</label>
            <textarea id="description" {...register('description')} rows={4} className="input mt-3 resize-y" placeholder={t('report.placeholder')} aria-invalid={!!errors.description} />
            {errors.description && <p className="mt-1 text-sm font-medium text-critical">{errors.description.message}</p>}
            {aiError && <p className="mt-2 flex items-start gap-2 rounded-control bg-neutral-100 p-3 text-sm text-neutral-600"><AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-moderate" />{aiError}. You can still fill the form yourself.</p>}
            {aiResults && (
              <div className="mt-3 rounded-control border border-primary-100 bg-primary-50 p-3 text-sm">
                <p className="font-semibold text-primary-800">What we understood. Check it before sending.</p>
                {typeof aiResults.summary === 'string' && aiResults.summary && <p className="mt-1 text-ink">{aiResults.summary}</p>}
                {Array.isArray(aiResults.immediate_needs) && aiResults.immediate_needs.length > 0 && <p className="mt-1"><strong>Needs:</strong> {aiResults.immediate_needs.join(', ')}</p>}
                {Array.isArray(aiResults.uncertainties) && aiResults.uncertainties.length > 0 && <p className="mt-1 text-moderate"><strong>Still unclear:</strong> {aiResults.uncertainties.map(String).join('; ')}</p>}
              </div>
            )}
          </Step>

          <Step n={3} title={t('report.where')} hint={t('report.whereHint')}>
            <LocationPicker onPick={(lat, lng) => void selectLocation(lat, lng)} />
            {coords && <p className="mt-2 flex items-center gap-2 text-sm font-medium text-success"><MapPin size={16} aria-hidden="true" />{locationName || 'Selected location'}</p>}
          </Step>

          <section className="card card-body">
            <h2 className="text-xl font-semibold">{t('report.who')}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t('report.who')}>
              {[false, true].map((proxy) => (
                <button key={String(proxy)} type="button" aria-pressed={proxyReport === proxy} onClick={() => setProxyReport(proxy)}
                  className={`flex min-h-[52px] items-center justify-center gap-2 rounded-control border-2 px-3 text-[15px] font-semibold ${proxyReport === proxy ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-line text-ink hover:border-neutral-300'}`}>
                  {proxy ? <Users size={18} aria-hidden="true" /> : <User size={18} aria-hidden="true" />}{proxy ? t('report.someoneElse') : t('report.me')}
                </button>
              ))}
            </div>
            {proxyReport && (
              <div className="mt-3">
                <label htmlFor="relationship" className="label">{t('report.relationship')}</label>
                <input id="relationship" className="input" value={proxyRelationship} onChange={(event) => setProxyRelationship(event.target.value)} placeholder={t('report.relationshipPlaceholder')} />
              </div>
            )}
            <fieldset className="mt-4">
              <legend className="label">{t('report.needs')}</legend>
              <p className="-mt-1 mb-2 text-sm text-neutral-500">{t('report.needsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {NEEDS.map((need) => {
                  const on = vulnerabilityFlags.includes(need);
                  return (
                    <label key={need} className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary-600 ${on ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800' : 'border-line bg-white hover:border-neutral-300'}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={(event) => toggleNeed(need, event.target.checked)} />
                      {on && <Check size={15} aria-hidden="true" />}{t(`need.${need}`)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section className="card card-body">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Camera size={20} aria-hidden="true" />{t('report.photo')}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t('report.photoHint')}</p>
            <label className="btn-secondary mt-3 w-full cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary-600 sm:w-auto">
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
              <Camera size={18} aria-hidden="true" /><span className="truncate">{photo ? photo.name : t('report.photoPick')}</span>
            </label>
          </section>

          <section className="card">
            <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-start" onClick={() => setMoreDetails((value) => !value)} aria-expanded={moreDetails} aria-controls="more-details">
              <span><span className="block font-display text-xl font-semibold">{t('report.more')}</span><span className="block text-sm text-neutral-500">{t('report.moreHint')}</span></span>
              <ChevronDown size={20} aria-hidden="true" className={`shrink-0 transition-transform ${moreDetails ? 'rotate-180' : ''}`} />
            </button>
            {moreDetails && (
              <div id="more-details" className="space-y-5 border-t border-line p-5">
                <div>
                  <label htmlFor="people" className="label">{t('report.people')}</label>
                  <input id="people" type="number" inputMode="numeric" min={0} step={1} {...register('people_affected', { valueAsNumber: true })} className="input w-32" />
                  {errors.people_affected && <p className="mt-1 text-sm font-medium text-critical">{errors.people_affected.message}</p>}
                </div>
                <TriStateField label={t('report.trapped')} name="people_trapped" register={register} watch={watch} setValue={setValue} />
                <TriStateField label={t('report.injured')} name="injuries_reported" register={register} watch={watch} setValue={setValue} />
                <TriStateField label={t('report.vulnerable')} name="vulnerable_people" register={register} watch={watch} setValue={setValue} />
                <TriStateField label={t('report.worse')} name="danger_increasing" register={register} watch={watch} setValue={setValue} />
                <p className="rounded-control bg-neutral-100 p-3 text-sm text-neutral-600">{t('report.unsureNote')}</p>
                <div>
                  <label htmlFor="landmark" className="label">{t('report.landmark')}</label>
                  <input id="landmark" {...register('area_landmark')} className="input" />
                </div>
                <fieldset>
                  <legend className="label">{t('report.contact')}</legend>
                  <p className="-mt-1 mb-2 text-sm text-neutral-500">{t('report.contactHint')}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input {...register('reporter_name')} className="input" placeholder={t('report.name')} aria-label={t('report.name')} autoComplete="name" />
                    <input {...register('reporter_phone')} className="input" placeholder={t('report.phone')} aria-label={t('report.phone')} type="tel" autoComplete="tel" inputMode="tel" />
                  </div>
                </fieldset>
              </div>
            )}
          </section>
        </form>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[500] border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="btn-ghost hidden sm:inline-flex">{t('nav.home')}</Link>
          <button type="submit" form="report-form" className="btn-danger btn-lg flex-1 text-lg" disabled={createIncident.isPending || voiceUploading}>
            {createIncident.isPending ? <><LoadingSpinner size={18} className="border-white/40 border-t-white" />{t('report.sending')}</> : voiceUploading ? t('report.attaching') : <><Send size={20} aria-hidden="true" />{t('report.send')}</>}
          </button>
        </div>
      </div>

      <Modal open={!!followup} onClose={() => answerFollowup(null)} title="One quick question" size="sm">
        {followup && (
          <div>
            <p className="mb-4 flex items-start gap-2 text-lg font-semibold text-ink"><MessageCircleQuestion size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-primary-600" />{followup.q.question}</p>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button type="button" className="btn-danger btn-lg" onClick={() => answerFollowup('yes')}>{t('tri.yes')}</button>
              <button type="button" className="btn-secondary btn-lg" onClick={() => answerFollowup('no')}>{t('tri.no')}</button>
              <button type="button" className="btn-secondary btn-lg" onClick={() => answerFollowup('unknown')}>{t('tri.unknown')}</button>
            </div>
            <button type="button" className="btn-ghost w-full" onClick={() => answerFollowup(null)}>Skip and send now</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Step({ n, title, hint, aside, children }: { n: number; title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card card-body">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-base font-bold text-white" aria-hidden="true">{n}</span>
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {hint && <p className="text-sm text-neutral-500">{hint}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TriStateField({ label, name, register, watch, setValue }: {
  label: string;
  name: 'people_trapped' | 'injuries_reported' | 'vulnerable_people' | 'danger_increasing';
  register: ReturnType<typeof useForm<FormData>>['register'];
  watch: ReturnType<typeof useForm<FormData>>['watch'];
  setValue: ReturnType<typeof useForm<FormData>>['setValue'];
}) {
  const { t } = useLang();
  const value = watch(name);
  const selected: Record<TriState, string> = { yes: 'border-critical bg-[#FBE4E1] text-critical', no: 'border-success bg-[#E1F0E8] text-success', unknown: 'border-neutral-500 bg-neutral-100 text-ink' };
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['yes', 'no', 'unknown'] as const).map((option) => (
          <button key={option} type="button" aria-pressed={value === option} onClick={() => setValue(name, option)}
            className={`min-h-[44px] rounded-control border-2 text-[15px] font-semibold transition-colors ${value === option ? selected[option] : 'border-line text-neutral-600 hover:border-neutral-300'}`}>
            {t(`tri.${option}`)}
          </button>
        ))}
      </div>
      <input type="hidden" {...register(name)} />
    </fieldset>
  );
}
