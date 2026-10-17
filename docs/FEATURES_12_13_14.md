# ResQNet: features 12, 13, 14

Branch: `fahad` (built on the latest `main`, which includes Arham's auth and roles)
Status: implemented and tested on a local Supabase stack. **Not yet deployed to the hosted project.**

| # | Feature | In one line |
|---|---|---|
| 12 | Smart follow-up question | When a critical fact is missing, the reporter gets **one** short question they can skip |
| 13 | Emergency risk score | 0–100 score where **every point has a reason**, and unknown facts are listed as gaps |
| 14 | Information confidence | A separate high / medium / low score for **how well supported** the report is; high risk + low confidence = **Urgent check** |

---

## How it works

### 12. Smart follow-up question
1. The reporter fills in the form (optionally using AI Assist) and presses **Submit Report**.
2. The app checks the critical facts for that emergency type, most important first:

   | Type | Order of questions |
   |---|---|
   | Flood | Is anyone trapped or unable to leave? → Is the water still rising? → Are children, elderly or disabled people there? → Is anyone injured? |
   | Fire | Is anyone still inside? → Is the fire spreading? → Is anyone injured or burned? |
   | Medical | Is the person unconscious, not breathing, or bleeding heavily? → Is their condition getting worse? |
   | Heatwave | Is anyone unconscious, confused or vomiting? → Are elderly people or young children affected? |
   | Other | Is anyone injured? → Is anyone trapped? |

3. If one of these is still **Unknown**, a single dialog asks it, with big **Yes / No / Not sure** buttons and **Skip and send report now**.
4. Whatever they choose (including closing the dialog), the report is sent straight away. There is never a second question.
5. A Yes or No answer fills in that field before sending. The question, the answer and whether it was skipped are saved, and coordinators see them on the incident page ("Follow-up asked: … — yes / skipped by reporter").

The rules are in `frontend/src/lib/followup.ts`. They don't depend on the AI, so they always work.

### 13. Emergency risk score
Calculated in the database every time an incident is created or changed. Same weights as before, so **existing scores did not change**:

| Factor | Points |
|---|---|
| People trapped | +40 |
| Injuries or urgent medical needs | +25 |
| Vulnerable people at risk | +15 |
| Conditions getting worse | +10 |
| People affected | +2 each, up to +10 |

Critical ≥ 75 · High ≥ 50 · Moderate ≥ 25 · Low below that. Trapped or injured people also mark the incident **life-threatening**.

Each factor is stored with a status: **Reported** (from the form) or **Answered in follow-up**. Facts still marked Unknown are listed under **"Not yet known (treated as 'cannot assume safe')"**, so coordinators see what's missing, not just a number.

Where to see it:
- Incident page → **"Why this priority"** panel: each reason, its points, its source, and the total.
- Incidents list → the top 2 reasons under each priority, e.g. "People reported trapped · Injuries or urgent medical needs".

### 14. Information confidence
A separate 0–100 score. **It never changes the risk score.**

| Signal | Effect |
|---|---|
| Location pinned on the map | +15 |
| Area or landmark given | +10 |
| Each of the 4 key facts known (trapped / injuries / vulnerable / worsening) | +8 each |
| Number of people stated | +5 |
| Detailed description (60+ characters) | +5 |
| Form answers match what AI Assist read in the description | +5 (each contradiction −8) |
| Reporter answered the follow-up question | +5 |
| **Other reports nearby describing the same type of emergency** (within 500 m and 6 hours) | +10 each, up to +30 |
| Coordinator marked it Verified / Flagged / Disputed | +20 / −10 / −25 |

High ≥ 70 · Medium ≥ 40 · Low below that.

**Urgent check rule:** if the risk is High or Critical (or life-threatening) **and** confidence is Low, the incident gets a red **Urgent check** badge. It keeps its high priority. Uncertain doesn't mean unimportant.

When a new report arrives, matching reports nearby are recalculated too, so the first report's confidence rises as more witnesses report the same thing.

Where to see it:
- Incident page → confidence badge next to the score, and an **"Information confidence"** panel listing every reason with its + / − value.
- Incidents list → a **Confidence** column with the Urgent check badge.

---

## Files changed

| File | What |
|---|---|
| `backend/supabase/migrations/20261018100000_resqnet_followup_risk_confidence.sql` | New columns, risk and confidence calculation (trigger), witness matching, follow-up fields on `submit_public_incident`, fixed `recalculate_incident_priority` |
| `frontend/src/lib/followup.ts` | Follow-up question rules |
| `frontend/src/pages/ReportPage.tsx` | Follow-up dialog; AI Assist no longer overwrites answers with "unknown" |
| `frontend/src/components/incident/PriorityPanels.tsx` | Why-this-priority panel, confidence panel and badges |
| `frontend/src/pages/IncidentDetailPage.tsx`, `IncidentsPage.tsx` | Show the panels, badges and "why" line |
| `frontend/src/hooks/useData.ts`, `src/types/index.ts`, `src/lib/triage.ts` | Data and types |

Also fixed along the way: "Recalculate Priority" used to read the RPC result incorrectly (it returns a one-row table), and the escalation check compared priority levels alphabetically.

---

## How to test it (local)

The app is running at **http://localhost:5173** against a local Supabase database in Docker, so testing does not touch the shared hosted database.

### Test accounts (local only)

| Role | Email | Password | Lands on | Sees |
|---|---|---|---|---|
| **Sender** (public reporter) | `sender@resqnet.local` | `Sender123!` | My reports | Only their own reports |
| **Responder** (Riverine Rescue Alpha team) | `responder@resqnet.local` | `Responder123!` | Responder | Only incidents assigned to their team |
| **Coordinator** (admin) | `coordinator@resqnet.local` | `Coordinator123!` | Dashboard | Everything |

Sign in at **http://localhost:5173/login**. You don't need an account to send a report: http://localhost:5173/report works signed out too.

### Demo incidents

| Code | What it shows |
|---|---|
| RN-000001 | Vague flood report ("people stuck"), High risk. Confidence is Medium only because RN-000002 nearby is a matching witness |
| RN-000002 | Detailed report with the follow-up answered, assigned to the responder's team |
| RN-000003 | Fire report where the reporter **skipped** the follow-up; low confidence, every fact unknown |
| RN-000004 | "Someone trapped and hurt", no details, nothing nearby → **High risk + Low confidence = Urgent check** |

### Things to try
1. **As sender:** send a flood report with "People trapped" left as Unknown → the question appears. Try Yes, then on another report try Skip. Both reports arrive. Check **My reports**.
2. **As coordinator:** open the Incidents list and look at the "why" line, the Confidence column and the Urgent check badge on RN-000004. Then open an incident:
   - Read the "Why this priority" panel and the confidence reasons.
   - Press **Verify** and watch confidence go up.
   - Send a second report within ~500 m of RN-000004 and watch its confidence rise.
3. **As responder:** open the Responder page and accept or complete the assignment on RN-000002.

---

## Deploying to the hosted project (not done yet)

From `backend/`:

```bash
npx supabase db push
```

This adds the new columns and recalculates every existing incident. Risk scores stay the same; confidence values are filled in for the first time. No Edge Function changes are needed for these three features.

## Not included

Features 11 and 15–20 (full LLM understanding, duplicates and merging, evidence review, automatic escalation with change lists, human correction and override) are kept on the local branch `fahad-ai-triage-all-backup`, ready to bring back later.
