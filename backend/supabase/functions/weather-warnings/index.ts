const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });

type Warning = { id: string; title: string; severity: "moderate" | "high" | "critical"; detail: string; instructions: string[]; incident_types: string[] };

async function persistWarnings(warnings: Warning[], latitude: number, longitude: number) {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key || !warnings.length) return;
  const d = 0.06;
  const zone = `SRID=4326;POLYGON((${longitude-d} ${latitude-d},${longitude+d} ${latitude-d},${longitude+d} ${latitude+d},${longitude-d} ${latitude+d},${longitude-d} ${latitude-d}))`;
  const observed = new Date();
  const expires = new Date(observed.getTime() + 24 * 60 * 60 * 1000);
  const rows = warnings.map((warning) => ({
    feed_key: `open-meteo-islamabad-${warning.id}`,
    title: warning.title,
    hazard_type: warning.id === "heavy-rain" || warning.id === "thunderstorm" ? "flood" : warning.id === "extreme-heat" ? "heatwave" : "other",
    message: `${warning.detail} ${warning.instructions.join(" ")}`,
    severity: warning.severity,
    source: "Open-Meteo",
    source_url: "https://open-meteo.com/",
    observed_at: observed.toISOString(),
    expires_at: expires.toISOString(),
    zone,
    is_simulation: false,
    active: true,
  }));
  const response = await fetch(`${base}/rest/v1/hazard_events?on_conflict=feed_key`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) console.error("Could not persist weather warnings", response.status, await response.text());
  else {
    const keys=rows.map(row=>row.feed_key).join(',');
    const found=await fetch(`${base}/rest/v1/hazard_events?select=id,feed_key,title,hazard_type,severity,message,expires_at&feed_key=in.(${keys})`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    if(found.ok){const events=await found.json() as Array<Record<string,string>>;await fetch(`${base}/rest/v1/danger_zones?on_conflict=hazard_event_id`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(events.map(event=>({hazard_event_id:event.id,name:event.title,hazard_type:event.hazard_type,severity:event.severity,zone,radius_m:6000,source:'official',verification_status:'confirmed',instructions:event.message,active:true,expires_at:event.expires_at})))})}
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({})) as { latitude?: number; longitude?: number; area?: string };
    const latitude = Number.isFinite(input.latitude) ? Number(input.latitude) : 33.6844;
    const longitude = Number.isFinite(input.longitude) ? Number(input.longitude) : 73.0479;
    if (latitude < 23 || latitude > 38 || longitude < 60 || longitude > 78) return json({ error: "Location must be within Pakistan" }, 400);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("hourly", "precipitation,precipitation_probability,apparent_temperature,wind_gusts_10m,weather_code");
    url.searchParams.set("forecast_hours", "24");
    url.searchParams.set("timezone", "Asia/Karachi");
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Forecast provider returned ${response.status}`);
    const data = await response.json() as { hourly?: Record<string, number[] | string[]>; generationtime_ms?: number };
    const hourly = data.hourly ?? {};
    const numbers = (key: string) => (hourly[key] as number[] | undefined)?.filter(Number.isFinite) ?? [];
    const precipitation = numbers("precipitation");
    const probability = numbers("precipitation_probability");
    const temperature = numbers("apparent_temperature");
    const gusts = numbers("wind_gusts_10m");
    const codes = numbers("weather_code");
    const max = (values: number[]) => values.length ? Math.max(...values) : 0;
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const warnings: Warning[] = [];
    const rainTotal = sum(precipitation);
    const rainPeak = max(precipitation);
    if (rainTotal >= 25 || rainPeak >= 10 || max(probability) >= 85) warnings.push({
      id: "heavy-rain", title: "Heavy rain and flash-flood risk", severity: rainTotal >= 50 || rainPeak >= 20 ? "critical" : "high",
      detail: `${rainTotal.toFixed(1)} mm forecast over 24 hours; peak ${rainPeak.toFixed(1)} mm/hour.`, incident_types: ["flood", "medical_emergency"],
      instructions: ["Avoid streams, underpasses, and low-lying roads.", "Never walk or drive through moving floodwater.", "Move people, medicines, and documents to higher ground."],
    });
    const feelsLike = max(temperature);
    if (feelsLike >= 40) warnings.push({
      id: "extreme-heat", title: "Dangerous heat risk", severity: feelsLike >= 45 ? "critical" : "high",
      detail: `Maximum apparent temperature ${feelsLike.toFixed(1)}°C in the next 24 hours.`, incident_types: ["heatwave", "medical_emergency", "fire"],
      instructions: ["Stay in shade or a cooled building during peak heat.", "Drink water regularly and check older people, children, and outdoor workers.", "Call for medical help for confusion, fainting, or very hot dry skin."],
    });
    const gustPeak = max(gusts);
    if (gustPeak >= 55) warnings.push({
      id: "strong-wind", title: "Strong wind risk", severity: gustPeak >= 80 ? "critical" : "high",
      detail: `Wind gusts may reach ${gustPeak.toFixed(0)} km/h.`, incident_types: ["fire", "flood", "other"],
      instructions: ["Stay away from trees, billboards, damaged walls, and power lines.", "Secure loose outdoor items and avoid unnecessary travel.", "Report fallen power lines and keep people well away."],
    });
    if (codes.some((code) => code >= 95)) warnings.push({
      id: "thunderstorm", title: "Thunderstorm risk", severity: codes.some((code) => code >= 96) ? "high" : "moderate",
      detail: "Thunderstorms are forecast within the next 24 hours.", incident_types: ["flood", "fire", "medical_emergency", "other"],
      instructions: ["Move indoors and avoid rooftops, open ground, and isolated trees.", "Unplug sensitive equipment where safe and avoid contact with electrical wiring.", "Delay travel during intense lightning or rain."],
    });
    await persistWarnings(warnings, latitude, longitude);
    return json({ area: input.area || "Islamabad, Pakistan", latitude, longitude, issued_at: new Date().toISOString(), valid_hours: 24, source: "Open-Meteo forecast", warnings });
  } catch (error) {
    console.error(error);
    return json({ error: "Weather warnings are temporarily unavailable" }, 502);
  }
});
