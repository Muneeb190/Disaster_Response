import { useQuery } from '@tanstack/react-query';

export interface WeatherWarning {
  id: string;
  title: string;
  severity: 'moderate' | 'high' | 'critical';
  detail: string;
  instructions: string[];
  incident_types: string[];
}

export interface WeatherWarnings {
  area: string;
  issued_at: string;
  valid_hours: number;
  source: string;
  warnings: WeatherWarning[];
}

export function useWeatherWarnings() {
  return useQuery({
    queryKey: ['weather-warnings', 'islamabad'],
    queryFn: async (): Promise<WeatherWarnings> => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-warnings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ latitude: 33.6844, longitude: 73.0479, area: 'Islamabad, Pakistan' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Weather warnings unavailable');
      return data;
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });
}
