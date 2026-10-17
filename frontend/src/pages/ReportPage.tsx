import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Radio, ArrowLeft, ArrowRight, Check, Copy, MapPin, Sparkles, AlertCircle, Search } from 'lucide-react';
import { LocationPicker } from '@/components/map/IncidentMap';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { useCreateIncident } from '@/hooks/useData';
import { useToast } from '@/components/ui/toast-context';
import { LoadingSpinner } from '@/components/ui/States';
import type { IncidentType, TriState } from '@/types';

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
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
<<<<<<< HEAD
  const [submittedWithVoice, setSubmittedWithVoice] = useState<boolean | null>(null);
=======
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);
>>>>>>> ecc7ced55c81a8028e12d9ac2c3478026756219f
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, unknown> | null>(null);
  const [voiceRecordingId, setVoiceRecordingId] = useState<string | null>(null);
  const [hasLocalAudio, setHasLocalAudio] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [reportDeliveryError, setReportDeliveryError] = useState<string | null>(null);

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

      // Pre-fill form fields from AI results (user can still edit)
      if (data.people_trapped && data.people_trapped !== 'null') {
        setValue('people_trapped', data.people_trapped);
      }
      if (data.injuries_reported && data.injuries_reported !== 'null') {
        setValue('injuries_reported', data.injuries_reported);
      }
      if (data.vulnerable_people && data.vulnerable_people !== 'null') {
        setValue('vulnerable_people', data.vulnerable_people);
      }
      if (data.danger_increasing && data.danger_increasing !== 'null') {
        setValue('danger_increasing', data.danger_increasing);
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

  const onSubmit = async (data: FormData) => {
    if (!coords) {
      toast('Please pin your location on the map', 'error');
      return;
    }
    try {
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
        voice_recording_id: voiceRecordingId,
      });
      setSubmittedWithVoice(
        voiceRecordingId ? incident.voice_recording_id === voiceRecordingId : null
      );
      setSubmittedCode(incident.report_code);
      setSubmittedToken(incident.tracking_token);
      toast('Emergency report submitted successfully', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit report';
      setReportDeliveryError(`${message}. The server did not confirm receipt, so do not assume rescuers have been notified.${voiceRecordingId ? ' The uploaded audio is retained on the server, but the report/audio association is unconfirmed.' : hasLocalAudio ? ' Your audio remains on this device only and was not included in the report.' : ''}`);
      toast('Report receipt was not confirmed. Do not assume rescuers have been notified.', 'error');
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
          {voiceRecordingId && (
            <p className={`mb-5 rounded-lg border p-3 text-left text-sm ${
              submittedWithVoice
                ? 'border-blue-200 bg-blue-50 text-blue-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}>
              {submittedWithVoice
                ? 'Your audio reference is attached to this report. Transcription may continue processing.'
                : 'The report was received, but the reporting server did not confirm the audio reference. The recording remains on the server; do not assume coordinators can access it.'}
            </p>
          )}
          {!voiceRecordingId && hasLocalAudio && (
            <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900">
              Your report was received, but the audio is saved on this device only and was not sent to rescuers.
            </p>
          )}

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
          {reportDeliveryError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{reportDeliveryError}</span>
            </div>
          )}
          <VoiceRecorder
            description={description || ''}
            onTranscript={(transcript) => {
              const existing = watch('description')?.trim();
              setValue('description', existing ? `${existing}\n${transcript}` : transcript, { shouldValidate: true });
            }}
            onRecordingId={setVoiceRecordingId}
            onUploadingChange={setVoiceUploading}
            onLocalAudioSaved={() => setHasLocalAudio(true)}
          />

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
            <textarea
              {...register('description')}
              rows={4}
              className="input resize-none"
              placeholder="Describe what's happening. E.g., 'Water is entering our house, my elderly father cannot walk, and we are trapped upstairs.'"
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
            <label className="label">
              Location <span className="text-error">*</span> — <span className="text-neutral-400 font-normal">Click on the map to pin your location</span>
            </label>
            <LocationPicker onPick={(lat, lng) => setCoords({ lat, lng })} />
            {coords && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-700">
                <MapPin size={14} />
                Pinned: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
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
            <button type="submit" className="btn-primary btn-lg" disabled={createIncident.isPending || voiceUploading}>
              {createIncident.isPending ? (
                <>
                  <LoadingSpinner size={18} /> Submitting...
                </>
              ) : voiceUploading ? (
                <>Uploading audio...</>
              ) : (
                <>
                  Submit Report <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
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
