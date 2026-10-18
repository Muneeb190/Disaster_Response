import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Radio, ArrowLeft, ArrowRight, Check, Copy, MapPin, LocateFixed, Sparkles, AlertCircle, Search, MessageCircleQuestion, Mic, Square, Trash2 } from 'lucide-react';
import { LocationPicker } from '@/components/map/IncidentMap';
import { useCreateIncident } from '@/hooks/useData';
import { useToast } from '@/components/ui/toast-context';
import { LoadingSpinner } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { pickFollowupQuestion, type FollowupQuestion } from '@/lib/followup';
import { isRecordingSupported, startRecording, toWavBase64, type Recording } from '@/lib/voiceRecorder';
import { TranscriptText } from '@/components/incident/TranscriptText';
import { reverseGeocode } from '@/lib/geocoding';
import type { IncidentType, TriState, VoiceTranscription } from '@/types';

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

const incidentTypes: { value: IncidentType; label: string; icon: string }[] = [
  { value: 'flood', label: 'Flood', icon: '🌊' },
  { value: 'fire', label: 'Fire', icon: '🔥' },
  { value: 'medical_emergency', label: 'Medical Emergency', icon: '🚑' },
  { value: 'heatwave', label: 'Heatwave', icon: '🌡' },
  { value: 'other', label: 'Other', icon: '⚠' },
];

const triStateOptions: { value: TriState; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

export function ReportPage() {
  const { toast } = useToast();
  const createIncident = useCreateIncident();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locating, setLocating] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, unknown> | null>(null);
  // Feature 12: at most one follow-up question, always skippable.
  const [followup, setFollowup] = useState<{ q: FollowupQuestion; data: FormData } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceTranscription | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const stoppingRef = useRef(false);

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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast('Location is not supported by this browser', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: current }) => {
        void selectLocation(current.latitude, current.longitude).finally(() => setLocating(false));
      },
      (error) => {
        setLocating(false);
        toast(error.code === error.PERMISSION_DENIED ? 'Allow location access and try again' : 'Could not get your current location', 'error');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  };

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => recordingRef.current?.cancel(), []);

  const applyVoiceResult = (result: VoiceTranscription) => {
    setVoiceResult(result);
    setValue('description', result.transcript, { shouldValidate: true });
    setValue('type', result.incident_category);
    if (result.people_affected !== null) setValue('people_affected', result.people_affected);
    for (const field of ['people_trapped', 'injuries_reported', 'vulnerable_people', 'danger_increasing'] as const) {
      if (result[field] !== 'unknown') setValue(field, result[field]);
    }
    setAiResults(result as unknown as Record<string, unknown>);
  };

  const finishRecording = async () => {
    if (!recordingRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    const current = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    setTranscribing(true);
    setVoiceError(null);
    try {
      const blob = await current.stop();
      const audio = await toWavBase64(blob);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ audio_base64: audio, mime_type: 'audio/wav' }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `Transcription failed (${res.status})`);
      applyVoiceResult(result as VoiceTranscription);
      toast('Voice report transcribed. Please review it before submitting.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not transcribe the recording';
      setVoiceError(message);
      toast(message, 'error');
    } finally {
      stoppingRef.current = false;
      setTranscribing(false);
    }
  };

  const beginRecording = async () => {
    setVoiceError(null);
    setVoiceResult(null);
    setRecordingSeconds(0);
    try {
      recordingRef.current = await startRecording(() => void finishRecording());
      setRecording(true);
    } catch (err) {
      setVoiceError(err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access or type your report.'
        : 'Could not access the microphone. You can still type your report.');
    }
  };

  const removeVoice = () => {
    recordingRef.current?.cancel();
    recordingRef.current = null;
    setRecording(false);
    setVoiceResult(null);
    setVoiceError(null);
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
      const incident = await createIncident.mutateAsync({
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
        voice_transcript: voiceResult?.transcript ?? null,
        transcript_language: voiceResult?.language ?? null,
        transcript_english: voiceResult?.english_translation ?? null,
      });
      setSubmittedCode(incident.report_code);
      setSubmittedToken(incident.tracking_token);
      toast('Emergency report submitted successfully', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to submit report', 'error');
    }
  };

  // Confirmation screen
  if (submittedCode) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="card max-w-lg w-full card-body text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Report Submitted</h2>
          <p className="text-sm text-neutral-600 mb-1">
            Your emergency report has been received and is now visible to coordinators.
          </p>
          <p className="text-sm text-neutral-600 mb-5">
            Save both values below. The private tracking key protects your report from unauthorized access.
          </p>

          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-5">
            <p className="text-xs text-neutral-500 mb-1">Your Report ID</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-lg font-bold text-primary-700 tracking-wider">{submittedCode}</code>
              <button
                className="btn-ghost btn-sm p-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(submittedCode);
                  toast('Report ID copied', 'success');
                }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
            <p className="text-xs text-blue-600 mb-1">Private Tracking Key</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-sm font-bold text-blue-800 break-all">{submittedToken}</code>
              <button
                className="btn-ghost btn-sm p-1.5"
                onClick={() => {
                  if (submittedToken) navigator.clipboard.writeText(submittedToken);
                  toast('Tracking key copied', 'success');
                }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/status" className="btn-secondary">
              <Search size={18} />
              Check Status
            </Link>
            <Link to="/" className="btn-ghost">
              <ArrowLeft size={18} />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
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

      {/* Form */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-800 mb-1">Report an Emergency</h1>
          <p className="text-sm text-neutral-500">
            Fill out the form below. Fields marked with <span className="text-error">*</span> are required.
            Unknown means you're not sure — that's okay.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Incident Type */}
          <div className="card card-body">
            <label className="label">Incident Type <span className="text-error">*</span></label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {incidentTypes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`p-3 rounded-lg border-2 text-center transition-all ${watch('type') === t.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                  onClick={() => setValue('type', t.value)}
                >
                  <div className="text-xl mb-1">{t.icon}</div>
                  <div className="text-xs font-medium">{t.label}</div>
                </button>
              ))}
            </div>
            <input type="hidden" {...register('type')} />
            {errors.type && <p className="text-xs text-error mt-1">{errors.type.message}</p>}
          </div>

          {/* Description + AI */}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Description <span className="text-error">*</span></label>
              <button
                type="button"
                className="btn-ghost btn-sm text-primary-600"
                onClick={handleAiExtract}
                disabled={aiExtracting}
              >
                {aiExtracting ? <LoadingSpinner size={14} /> : <Sparkles size={14} />}
                AI Assist
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {!recording ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void beginRecording()} disabled={transcribing || !isRecordingSupported()}>
                    {transcribing ? <LoadingSpinner size={14} /> : <Mic size={14} />}
                    {transcribing ? 'Transcribing…' : voiceResult ? 'Record again' : 'Speak in English or Urdu'}
                  </button>
                ) : (
                  <button type="button" className="btn-danger btn-sm" onClick={() => void finishRecording()}>
                    <Square size={13} /> Stop recording
                  </button>
                )}
                {recording && <span className="text-xs font-medium text-red-600">Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')} / 2:00</span>}
                {voiceResult && <button type="button" className="btn-ghost btn-sm ml-auto" onClick={removeVoice}><Trash2 size={14} /> Remove voice</button>}
              </div>
              {!isRecordingSupported() && <p className="mt-2 text-xs text-neutral-500">Voice recording is not supported in this browser. Please type your report.</p>}
              {voiceError && <p className="mt-2 text-xs text-error">{voiceError}</p>}
              {voiceResult && (
                <div className="mt-3 border-t border-neutral-200 pt-3">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Original transcript</p>
                  <TranscriptText text={voiceResult.transcript} language={voiceResult.language} className="text-sm text-neutral-800" />
                  {voiceResult.language !== 'en' && <p className="mt-2 text-xs text-neutral-500">The editable description below keeps your original words. Coordinators will also receive an English translation.</p>}
                </div>
              )}
            </div>
            <textarea
              {...register('description')}
              rows={4}
              className="input resize-none"
              placeholder="Type what is happening, or record a voice report in English or Urdu."
            />
            {errors.description && <p className="text-xs text-error mt-1">{errors.description.message}</p>}
            {aiError && (
              <div className="flex items-start gap-2 mt-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg p-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-yellow-500" />
                <span>{aiError}. You can still fill the form manually below.</span>
              </div>
            )}
            {aiResults && (
              <div className="mt-2 text-xs text-neutral-600 bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="font-medium text-blue-700 mb-1">AI Extracted (review and confirm):</p>
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(aiResults, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="card card-body">
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="label mb-0">Location <span className="text-error">*</span> — <span className="text-neutral-400 font-normal">Tap the map or use your phone location</span></label>
              <button type="button" className="btn-primary btn-sm shrink-0" onClick={useCurrentLocation} disabled={locating}>
                {locating ? <LoadingSpinner size={14} /> : <LocateFixed size={14} />} {locating ? 'Locating…' : 'Use my location'}
              </button>
            </div>
            <LocationPicker onPick={(lat, lng) => void selectLocation(lat, lng)} initialPos={coords ? [coords.lat, coords.lng] : undefined} />
            {coords && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-700">
                <MapPin size={14} />
                {locationName || 'Selected location'}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="card card-body space-y-4">
            <div>
              <label className="label">Area or Landmark <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input {...register('area_landmark')} className="input" placeholder="E.g., Riverside Colony Block 3" />
            </div>

            <div>
              <label className="label">Number of People Affected <span className="text-error">*</span></label>
              <input
                type="number"
                min={0}
                step={1}
                {...register('people_affected', { valueAsNumber: true })}
                className="input w-32"
              />
              {errors.people_affected && <p className="text-xs text-error mt-1">{errors.people_affected.message}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <TriStateField label="People Trapped?" name="people_trapped" register={register} watch={watch} setValue={setValue} />
              <TriStateField label="Injuries or Medical Needs?" name="injuries_reported" register={register} watch={watch} setValue={setValue} />
              <TriStateField label="Vulnerable People at Risk?" name="vulnerable_people" register={register} watch={watch} setValue={setValue} />
              <TriStateField label="Danger Increasing?" name="danger_increasing" register={register} watch={watch} setValue={setValue} />
            </div>

            <p className="text-xs text-neutral-400 bg-neutral-50 rounded-lg p-2">
              Unknown means you're not sure — this is treated as unknown, not as "no."
              Coordinators will follow up to clarify.
            </p>
          </div>

          {/* Contact (optional) */}
          <div className="card card-body">
            <label className="label text-sm font-medium text-neutral-700">Contact Details <span className="text-neutral-400 font-normal">(optional — used only for follow-up)</span></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <input {...register('reporter_name')} className="input" placeholder="Your name" />
              <input {...register('reporter_phone')} className="input" placeholder="Phone number" />
            </div>
            <p className="text-xs text-neutral-400 mt-2">Your contact information is protected and only visible to coordinators.</p>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="btn-ghost">
              <ArrowLeft size={18} /> Cancel
            </Link>
            <button type="submit" className="btn-primary btn-lg" disabled={createIncident.isPending}>
              {createIncident.isPending ? (
                <>
                  <LoadingSpinner size={18} /> Submitting...
                </>
              ) : (
                <>
                  Submit Report <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      <Modal open={!!followup} onClose={() => answerFollowup(null)} title="One quick question" size="sm">
        {followup && (
          <div>
            <p className="text-base font-medium text-neutral-800 mb-4 flex items-start gap-2">
              <MessageCircleQuestion size={20} className="text-primary-600 flex-shrink-0 mt-0.5" />
              {followup.q.question}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button type="button" className="btn-danger btn-lg" onClick={() => answerFollowup('yes')}>Yes</button>
              <button type="button" className="btn-secondary btn-lg" onClick={() => answerFollowup('no')}>No</button>
              <button type="button" className="btn-secondary btn-lg" onClick={() => answerFollowup('unknown')}>Not sure</button>
            </div>
            <button type="button" className="btn-ghost w-full" onClick={() => answerFollowup(null)}>
              Skip and send report now <ArrowRight size={16} />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Reusable tri-state radio field
function TriStateField({
  label,
  name,
  register,
  watch,
  setValue,
}: {
  label: string;
  name: 'people_trapped' | 'injuries_reported' | 'vulnerable_people' | 'danger_increasing';
  register: ReturnType<typeof useForm<FormData>>['register'];
  watch: ReturnType<typeof useForm<FormData>>['watch'];
  setValue: ReturnType<typeof useForm<FormData>>['setValue'];
}) {
  const value = watch(name);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-1">
        {triStateOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${value === opt.value
              ? opt.value === 'yes'
                ? 'border-red-400 bg-red-50 text-red-700'
                : opt.value === 'no'
                ? 'border-green-400 bg-green-50 text-green-700'
                : 'border-neutral-400 bg-neutral-50 text-neutral-700'
              : 'border-neutral-200 text-neutral-400 hover:border-neutral-300'
            }`}
            onClick={() => setValue(name, opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
