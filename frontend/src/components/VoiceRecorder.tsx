import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Download, LoaderCircle, Mic, Square, Trash2 } from 'lucide-react';
import {
  getLocalVoiceRecordings,
  removeLocalVoiceRecording,
  saveLocalVoiceRecording,
  type LocalVoiceRecording,
} from '@/lib/voiceStorage';
import { uploadVoiceRecording, getTranscription } from '@/lib/api';

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error';
type SpeechLanguage = 'ur-PK' | 'en-US';

interface VoiceRecorderProps {
  description: string;
  onTranscript: (transcript: string) => void;
  onRecordingId: (recordingId: string | null) => void;
  onUploadingChange: (uploading: boolean) => void;
  onLocalAudioSaved: () => void;
}

const MAX_RECORDING_SECONDS = 55;

function recorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  ) ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Allow microphone access in your browser settings, then try again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found on this device.';
  }
  return error instanceof Error ? error.message : 'Could not record audio.';
}

export function VoiceRecorder({
  description,
  onTranscript,
  onRecordingId,
  onUploadingChange,
  onLocalAudioSaved,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [language, setLanguage] = useState<SpeechLanguage>('ur-PK');
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [playbackBlob, setPlaybackBlob] = useState<Blob | null>(null);
  const [localRecordings, setLocalRecordings] = useState<LocalVoiceRecording[]>([]);
  const playbackUrl = useMemo(
    () => playbackBlob ? URL.createObjectURL(playbackBlob) : null,
    [playbackBlob]
  );
  const recordingURLs = useMemo(() => new Map(
    localRecordings.map((recording) => [recording.id, URL.createObjectURL(recording.audio)])
  ), [localRecordings]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFailedRef = useRef(false);
  const languageRef = useRef(language);
  const mountedRef = useRef(true);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    mountedRef.current = true;
    void getLocalVoiceRecordings()
      .then((recordings) => {
        if (mountedRef.current) setLocalRecordings(recordings);
      })
      .catch(() => {
        if (mountedRef.current) {
          setMessage('This browser could not open local audio storage. Online recording is still available.');
        }
      });
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => () => {
    recordingURLs.forEach((url) => URL.revokeObjectURL(url));
  }, [recordingURLs]);

  useEffect(() => () => {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  }, [playbackUrl]);

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_RECORDING_SECONDS) {
          mediaRecorderRef.current?.stop();
          return MAX_RECORDING_SECONDS;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const persistLocally = async (audio: Blob) => {
    try {
      const saved = await saveLocalVoiceRecording(audio);
      if (mountedRef.current) {
        setLocalRecordings((current) => [saved, ...current]);
        onLocalAudioSaved();
        setMessage('The server could not be reached. This audio is saved on this device only; your report has not been sent to rescuers.');
      }
    } catch {
      if (mountedRef.current) {
        setMessage('The server could not be reached and browser storage is unavailable. Your audio was not saved and no report was sent.');
      }
    }
  };

  const processAudio = async (audio: Blob) => {
    setState('transcribing');
    setMessage('Uploading audio securely for transcription...');
    onUploadingChange(true);
    let recordingId: string | null = null;
    try {
      const created = await uploadVoiceRecording(audio, languageRef.current);
      onRecordingId(created.recordingId);
      recordingId = created.recordingId;
      onUploadingChange(false);
      setMessage('Audio received by the server. Transcription is processing; you can submit your report now.');

      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (!mountedRef.current) return;
        const result = await getTranscription(created.recordingId);
        if (result.status === 'ready') {
          if (result.transcript) onTranscript(result.transcript);
          if (mountedRef.current) {
            setState('ready');
            setMessage(
              result.transcript
                ? `Transcript ready${result.language ? ` (${result.language})` : ''}${result.confidence === null ? '' : `, ${Math.round(result.confidence * 100)}% confidence`}. Review or edit it in the description field.`
                : 'No speech was detected. Enter a description manually; the audio is attached to your report.'
            );
          }
          return;
        }
        if (result.status === 'failed') {
          if (mountedRef.current) {
            setState('error');
            setMessage(`Transcription could not be completed: ${result.error || 'unknown service error'}. You can still submit a written description; the audio reference is saved.`);
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      if (mountedRef.current) {
        setState('error');
        setMessage('Transcription is taking longer than expected. Your audio is attached; you can submit the written report while it finishes.');
      }
    } catch (error) {
      onUploadingChange(false);
      if (!recordingId) {
        onRecordingId(null);
        await persistLocally(audio);
      }
      if (mountedRef.current) {
        setState('error');
        if (recordingId) {
          setMessage('The audio is saved on the server and attached to your report, but transcription status could not be checked. You can submit the report with a written description.');
        } else if (!navigator.onLine) {
          setMessage('You are offline. The recording was saved on this device if browser storage is available; your report has not reached rescuers.');
        } else {
          setMessage(error instanceof Error ? error.message : 'Audio upload failed.');
        }
      }
    }
  };

  const startRecording = async () => {
    setMessage(null);
    setSeconds(0);
    onRecordingId(null);
    const mimeType = recorderMimeType();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) {
      setState('error');
      setMessage('This browser does not support secure audio recording. Try a recent version of Chrome or Firefox.');
      return;
    }

    setRequestingMicrophone(true);
    onUploadingChange(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingFailedRef.current = false;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        if (recordingFailedRef.current) {
          recordingFailedRef.current = false;
          return;
        }
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        if (audio.size > 0) {
          setPlaybackBlob(audio);
          void processAudio(audio);
        }
        else {
          onUploadingChange(false);
          setState('error');
          setMessage('No audio was captured. Please try recording again.');
        }
      }, { once: true });
      recorder.addEventListener('error', () => {
        recordingFailedRef.current = true;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onUploadingChange(false);
        setState('error');
        setMessage('The browser encountered an audio recording error. The audio was not uploaded; please try again.');
      }, { once: true });
      recorder.start();
      setRequestingMicrophone(false);
      setState('recording');
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRequestingMicrophone(false);
      onUploadingChange(false);
      setState('error');
      setMessage(errorMessage(error));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const deleteLocalRecording = async (id: string) => {
    try {
      await removeLocalVoiceRecording(id);
      setLocalRecordings((current) => current.filter((recording) => recording.id !== id));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="card card-body" aria-labelledby="voice-report-heading">
      <div className="mb-4">
        <h2 id="voice-report-heading" className="label mb-1">Describe it by voice <span className="text-neutral-400 font-normal">(optional)</span></h2>
        <p className="text-xs text-neutral-500">Record up to 55 seconds. Your audio is uploaded for transcription and attached to the report for coordinators.</p>
      </div>

      <label className="label text-xs" htmlFor="voice-language">Spoken language</label>
      <select
        id="voice-language"
        className="select max-w-xs mb-4"
        value={language}
        onChange={(event) => setLanguage(event.target.value as SpeechLanguage)}
        disabled={state === 'recording' || state === 'transcribing'}
      >
        <option value="ur-PK">Urdu (Pakistan)</option>
        <option value="en-US">English</option>
      </select>

      <div className="flex flex-wrap items-center gap-3">
        {state === 'recording' ? (
          <>
            <div className="flex items-center gap-2 text-red-700" role="status" aria-live="polite">
              <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse" />
              <span className="font-medium">Recording {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>
            </div>
            <button type="button" className="btn-danger" onClick={stopRecording}>
              <Square size={17} fill="currentColor" /> Stop recording
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-16 items-center gap-3 rounded-lg bg-[#176f63] px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-[#0f5c52] focus:outline-none focus:ring-2 focus:ring-[#176f63] focus:ring-offset-2 disabled:opacity-50"
            onClick={() => void startRecording()}
            disabled={state === 'transcribing' || requestingMicrophone}
          >
            {state === 'transcribing' || requestingMicrophone ? <LoaderCircle size={24} className="animate-spin" aria-hidden="true" /> : <Mic size={24} />}
            {requestingMicrophone ? 'Requesting microphone...' : state === 'transcribing' ? 'Transcribing...' : state === 'ready' || state === 'error' ? 'Record again' : 'Record emergency'}
          </button>
        )}
      </div>

      {message && (
        <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
          state === 'error' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'
        }`} role="status" aria-live="polite">
          {state === 'ready' ? <Check size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      {playbackUrl && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <label className="label text-xs" htmlFor="voice-recording-playback">Play back your recording</label>
          <audio
            id="voice-recording-playback"
            className="w-full"
            controls
            preload="metadata"
            src={playbackUrl}
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {localRecordings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Audio saved on this device only</p>
          <p className="mt-1 text-xs text-amber-800">These recordings have not reached rescuers. Download them or retry when you have a connection.</p>
          <ul className="mt-2 space-y-2">
            {localRecordings.map((recording) => (
              <li key={recording.id} className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-amber-900">{new Date(recording.createdAt).toLocaleString()}</span>
                <audio
                  className="h-9 w-full max-w-xs"
                  controls
                  preload="none"
                  src={recordingURLs.get(recording.id)}
                  aria-label={`Play saved recording from ${new Date(recording.createdAt).toLocaleString()}`}
                />
                <a
                  className="inline-flex items-center gap-1 font-semibold text-amber-900 underline"
                  href={recordingURLs.get(recording.id)}
                  download={`resqnet-emergency-${recording.id}.${recording.audio.type.includes('ogg') ? 'ogg' : 'webm'}`}
                >
                  <Download size={13} /> Download audio
                </a>
                <button type="button" className="inline-flex items-center gap-1 text-amber-900 underline" onClick={() => void deleteLocalRecording(recording.id)}>
                  <Trash2 size={13} /> Delete local copy
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state === 'recording' && (
        <p className="mt-3 text-xs text-neutral-500">Microphone is active. Stop to upload; transcription may continue while you complete the report.</p>
      )}
      {state === 'transcribing' && description.trim().length < 10 && (
        <p className="mt-3 text-xs text-neutral-600">The current reporting form requires a description of at least 10 characters and a pinned location before submission.</p>
      )}
    </section>
  );
}
