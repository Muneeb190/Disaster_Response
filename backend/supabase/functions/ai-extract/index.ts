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
  immediate_needs: string[];
  summary: string;
  uncertainties: string[];
}

// Deterministic keyword-based extraction (no external AI API required).
// This serves as a fallback when no LLM API key is configured, ensuring
// the application continues functioning per the spec requirements.
function extractFromText(text: string): ExtractResult {
  const lower = text.toLowerCase();

  const incident_category = (() => {
    if (/\b(flood|flooding|rising water|drown|submerg|inundat|deluge|water entering)\b/.test(lower)) return "flood";
    if (/\b(fire|flame|smoke|burn|blaze|inferno)\b/.test(lower)) return "fire";
    if (/\b(chest pain|collapsed|unconscious|bleeding|heart|stroke|seizure|medical|ambulance|injury|injured|hurt|wound)\b/.test(lower)) return "medical_emergency";
    if (/\b(heat|heatwave|dehydrat|hot|sunstroke|exhaustion|dizzy|faint)\b/.test(lower)) return "heatwave";
    return "other";
  })();

  const people_trapped = lower.match(/\b(trapped|stuck|cannot (?:move|escape|get out)|unable to (?:move|leave|escape)|stranded)\b/) ? "yes" : "unknown";
  const injuries_reported = lower.match(/\b(injur|hurt|wound|bleed|pain|unconscious|collapsed|seizure|burn(ed)?|broken|fracture)\b/) ? "yes" : "unknown";
  const vulnerable_people = lower.match(/\b(elder|old (?:man|woman|person)|child|baby|infant|disabled|wheelchair|cannot walk|pregnant|sick|bedridden)\b/) ? "yes" : "unknown";
  const danger_increasing = lower.match(/\b(rising|worsening|getting worse|spreading|increasing|growing|flood(?:ing)? (?:is |is )?(?:still )?rising|water (?:is )?entering|breaking|breach|deteriorat)\b/) ? "yes" : "unknown";

  const numberMatch = lower.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|persons?|individuals?|families?|kids?|children|adults?|men|women|workers?|residents?|victims?)\b/);
  const wordNumbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const people_affected = numberMatch ? (/^\d+$/.test(numberMatch[1]) ? parseInt(numberMatch[1], 10) : wordNumbers[numberMatch[1]]) : null;
  const needPatterns: Array<[string, RegExp]> = [
    ["rescue", /\b(rescue|save|help us|evacuat)/],
    ["medical care", /\b(doctor|medical|ambulance|medicine|first aid|hospital)/],
    ["boat", /\b(boat|raft)/],
    ["water", /\b(drinking water|clean water|thirst)/],
    ["food", /\b(food|hungry|meal)/],
    ["shelter", /\b(shelter|safe place|homeless|displaced)/],
  ];
  const immediate_needs = needPatterns.filter(([, pattern]) => pattern.test(lower)).map(([need]) => need);

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
    immediate_needs,
    summary: text.trim().replace(/\s+/g, " ").slice(0, 240),
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
