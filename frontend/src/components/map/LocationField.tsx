import { useCallback, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { LocationPicker } from '@/components/map/IncidentMap';
import { useOperationCenter } from '@/lib/region';

// Click-to-place location input for admin forms; opens on the current operation area.
export function LocationField({ value, onChange, label = 'Location' }: { value: [number, number] | null; onChange: (pos: [number, number]) => void; label?: string }) {
  const center = useOperationCenter();
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const pick = useCallback((lat: number, lng: number) => onChange([lat, lng]), [onChange]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoError('Location is not available in this browser.'); return; }
    setLocating(true); setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (position) => { onChange([position.coords.latitude, position.coords.longitude]); setMapKey((k) => k + 1); setLocating(false); },
      () => { setGeoError('Could not get your location. Click the map instead.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label} <span className="text-neutral-400 font-normal">(click the map)</span></label>
        <button type="button" className="btn-ghost btn-sm" onClick={useMyLocation} disabled={locating}><LocateFixed size={14} /> {locating ? 'Locating…' : 'Use my current location'}</button>
      </div>
      {/* Remount after geolocation so the map recentres on the new point. */}
      <LocationPicker key={mapKey} onPick={pick} initialPos={value ?? undefined} center={center} />
      <p className="text-xs text-neutral-500 mt-1">{value ? `${value[0].toFixed(5)}, ${value[1].toFixed(5)}` : 'Not set yet'}</p>
      {geoError && <p className="text-xs text-red-600 mt-1">{geoError}</p>}
    </div>
  );
}
