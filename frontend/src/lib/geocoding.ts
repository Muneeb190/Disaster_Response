const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!mapTilerKey) return 'Selected location';
  const response = await fetch(
    `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${encodeURIComponent(mapTilerKey)}&limit=1&language=en`,
  );
  if (!response.ok) throw new Error('Could not identify this area');
  const data = await response.json() as { features?: Array<{ place_name?: string; text?: string }> };
  return data.features?.[0]?.place_name || data.features?.[0]?.text || 'Selected location';
}
