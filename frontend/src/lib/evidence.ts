import { supabase } from '@/lib/supabase';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.78;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This photo could not be read'));
    };
    image.src = url;
  });
}

// Phone photos are resized before upload to keep the public reporting flow usable
// on slow connections. The original remains on the reporter's device.
export async function compressEvidencePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo compression is unavailable in this browser');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('The photo could not be compressed');
  if (blob.size > 3 * 1024 * 1024) throw new Error('The compressed photo is still larger than 3 MB');
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'evidence';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export async function uploadIncidentPhoto(
  file: File,
  reportCode: string,
  trackingToken: string,
): Promise<{ evidenceId: string; status: 'pending' }> {
  const compressed = await compressEvidencePhoto(file);
  const body = new FormData();
  body.append('photo', compressed);
  body.append('reportCode', reportCode);
  body.append('trackingToken', trackingToken);
  const { data, error } = await supabase.functions.invoke('incident-photo', { body });
  if (error) {
    if (error.context instanceof Response) {
      try {
        const response = await error.context.clone().json();
        if (typeof response?.error === 'string') throw new Error(response.error);
      } catch (cause) {
        if (cause instanceof Error && cause.message !== 'Unexpected end of JSON input') throw cause;
      }
    }
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return data as { evidenceId: string; status: 'pending' };
}

export async function signedEvidenceUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('incident-evidence').createSignedUrl(storagePath, 900);
  if (error) throw error;
  return data.signedUrl;
}
