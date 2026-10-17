/* eslint-disable no-irregular-whitespace */
// Records the microphone and converts the result to 16 kHz mono WAV, which every
// speech model accepts regardless of what the browser records natively (webm, ogg, mp4).

export const MAX_RECORDING_SECONDS = 120;

export function hasUrdu(text: string | null | undefined) {
  // Use escapes so this range remains stable regardless of the source-file encoding.
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text ?? '');
  /* c8 ignore next 1 -- legacy range retained temporarily for encoding-safe patching */
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text ?? '');
}
const SAMPLE_RATE = 16000;

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export function isRecordingSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function startRecording(onAutoStop: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
  });
  recorder.start(250);
  const timer = setTimeout(() => { if (recorder.state === 'recording') onAutoStop(); }, MAX_RECORDING_SECONDS * 1000);

  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      return stopped;
    },
    cancel: () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export async function toWavBase64(blob: Blob): Promise<string> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return bytesToBase64(encodeWav(rendered.getChannelData(0)));
  } finally {
    void ctx.close();
  }
}

function encodeWav(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
