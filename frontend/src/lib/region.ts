import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIncidents, useShelters, useTeams } from '@/hooks/useData';
import { parseLocation } from '@/types';

type LatLng = [number, number];

function useOperationPoints() {
  const incidents = useIncidents({ limit: 500 });
  const teams = useTeams();
  const shelters = useShelters();
  const points = useMemo(() => [
    ...(incidents.data ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status)).map((i) => parseLocation(i.location)),
    ...(teams.data ?? []).map((t) => parseLocation(t.location)),
    ...(shelters.data ?? []).map((s) => parseLocation(s.location)),
  ].filter((p): p is LatLng => !!p), [incidents.data, teams.data, shelters.data]);
  return { points, loading: incidents.isLoading || teams.isLoading || shelters.isLoading };
}

// Centre of current operations, used to open location pickers in the right place.
export function useOperationCenter(): LatLng | undefined {
  const { points } = useOperationPoints();
  return useMemo(() => (points.length
    ? [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
    : undefined), [points]);
}

// Label for the area covered by open incidents, teams and shelters.
export function useOperationArea() {
  const { points, loading } = useOperationPoints();
  const region = useOperationRegion(points);
  if (!points.length) return loading ? 'Loading…' : 'No operation area yet';
  return region.data ?? (region.isError ? 'Area name unavailable' : 'Locating…');
}

// Area name for the centre of the operation, from OpenStreetMap reverse geocoding.
// Cached per ~1 km centroid so the free Nominatim service is called rarely.
export function useOperationRegion(points: LatLng[]) {
  const centroid = points.length
    ? [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
    : null;
  const key = centroid ? `${centroid[0].toFixed(2)},${centroid[1].toFixed(2)}` : null;

  return useQuery({
    queryKey: ['operation-region', key],
    enabled: !!key,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const cacheKey = `resqnet-region-${key}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;
      } catch {
        // storage unavailable: just fetch
      }
      const [lat, lng] = key!.split(',');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lng}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`Region lookup failed (${res.status})`);
      const body = await res.json();
      const a = body.address ?? {};
      const local = a.city || a.town || a.county || a.state_district || a.village;
      const wider = a.state || a.country;
      const label = [local, wider].filter(Boolean).join(', ') || body.display_name || 'Unknown area';
      try {
        localStorage.setItem(cacheKey, label);
      } catch {
        // ignore
      }
      return label as string;
    },
  });
}

// Short local time-zone name, e.g. "PKT" or "GMT+5", for timestamps shown with the clock.
export function localTimeZoneLabel() {
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? '';
}
