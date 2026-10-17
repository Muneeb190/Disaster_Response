const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractRequest {
  description: string;
}

interface ExtractResult {
  incident_category: string | null;
  people_trapped: "yes" | "no" | "unknown";
  injuries_reported: "yes" | "no" | "unknown";
  vulnerable_people: "yes" | "no" | "unknown";
  danger_increasing: "yes" | "no" | "unknown";
  people_affected: number | null;
  uncertainties: string[];
}

// Deterministic keyword-based extraction (no external AI API required).
// This serves as a fallback when no LLM API key is configured, ensuring
// the application continues functioning per the spec requirements.
function extractFromText(text: string): ExtractResult {
  const lower = text.toLowerCase();

  const incident_category = (() => {
    if (/\b(flood|water|rising water|drown|wet|submerge|inundat|deluge)\b/.test(lower)) return "flood";
    if (/\b(fire|flame|smoke|burn|blaze|inferno)\b/.test(lower)) return "fire";
    if (/\b(chest pain|collapsed|unconscious|bleeding|heart|stroke|seizure|medical|ambulance|injury|injured|hurt|wound)\b/.test(lower)) return "medical_emergency";
    if (/\b(heat|heatwave|dehydrat|hot|sunstroke|exhaustion|dizzy|faint)\b/.test(lower)) return "heatwave";
    return "other";
  })();

  const people_trapped = lower.match(/\b(trapped|stuck|cannot (?:move|escape|get out)|unable to (?:move|leave|escape)|stranded)\b/) ? "yes" : "unknown";
  const injuries_reported = lower.match(/\b(injur|hurt|wound|bleed|pain|unconscious|collapsed|seizure|burn(ed)?|broken|fracture)\b/) ? "yes" : "unknown";
  const vulnerable_people = lower.match(/\b(elder|old (?:man|woman|person)|child|baby|infant|disabled|wheelchair|cannot walk|pregnant|sick|bedridden)\b/) ? "yes" : "unknown";
  const danger_increasing = lower.match(/\b(rising|worsening|getting worse|spreading|increasing|growing|flood(?:ing)? (?:is |is )?(?:still )?rising|water (?:is )?entering|breaking|breach|deteriorat)\b/) ? "yes" : "unknown";

  const numberMatch = lower.match(/\b(\d+)\s*(?:people|persons?|individuals?|families?|kids?|children|adults?|men|women|workers?|residents?|victims?)\b/);
  const people_affected = numberMatch ? parseInt(numberMatch[1], 10) : null;

  const uncertainties: string[] = [];
  if (people_trapped === "unknown") uncertainties.push("Whether people are trapped could not be determined from the text");
  if (injuries_reported === "unknown") uncertainties.push("Whether injuries occurred could not be determined");
  if (vulnerable_people === "unknown") uncertainties.push("Presence of vulnerable individuals could not be determined");
  if (danger_increasing === "unknown") uncertainties.push("Whether danger is increasing could not be determined");
  if (people_affected === null) uncertainties.push("Number of affected people not explicitly stated");

  return {
    incident_category,
    people_trapped,
    injuries_reported,
    vulnerable_people,
    danger_increasing,
    people_affected,
    uncertainties,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { description } = (await req.json()) as ExtractRequest;

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Description is required and must be at least 5 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deterministic extraction — works without any external API.
    // If an LLM API key is configured in the future, an LLM call can be
    // layered above this as an enhancement, with this as the fallback.
    const result = extractFromText(description);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "AI extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
