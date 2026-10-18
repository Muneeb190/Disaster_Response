export type LocateResult =
  | { ok: true; latitude: number; longitude: number; accuracy: number | null }
  | { ok: false; reason: LocateFailure };

export type LocateFailure = 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout';

// What the person can do about each failure, in plain words.
export const LOCATE_HELP: Record<LocateFailure, string> = {
  insecure: 'Location only works on a secure (https) link or on localhost. Open the app from its https address, or tap the map.',
  unsupported: 'This browser cannot share location. Tap the map to place the pin.',
  denied: 'Location permission is blocked. Allow location for this site in the browser address bar, then try again, or tap the map.',
  unavailable: 'Your device could not find its position. Check that location services are on (Windows: Settings > Privacy > Location), or tap the map.',
  timeout: 'Finding your position took too long. Try again outdoors or near a window, or tap the map.',
};

function attempt(highAccuracy: boolean, timeout: number) {
  return new Promise<LocateResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ ok: true, latitude: coords.latitude, longitude: coords.longitude, accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null }),
      (error) => resolve({ ok: false, reason: error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: highAccuracy ? 30_000 : 300_000 },
    );
  });
}

// GPS first; laptops without GPS often time out on high accuracy, so fall back to Wi-Fi/network position.
export async function locate(): Promise<LocateResult> {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
  if (!navigator.geolocation) return { ok: false, reason: 'unsupported' };
  const precise = await attempt(true, 8_000);
  if (precise.ok || precise.reason === 'denied') return precise;
  return attempt(false, 15_000);
}
