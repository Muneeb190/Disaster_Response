# ResQNet — AI-Powered Disaster Response and Resource Coordination Platform

A full-stack emergency response platform built for a 24-hour hackathon. ResQNet connects citizens with emergency coordinators: citizens submit incident reports, the system scores priority deterministically, and coordinators assign rescue teams and resources through a real-time command center dashboard.

## Features

### Citizen Portal
- **Emergency Report Form** — mobile-first incident reporting with map-based location pinning, tri-state indicators (trapped, injuries, vulnerable, danger increasing), and optional AI-assisted extraction from free-text descriptions.
- **Report Status Lookup** — citizens check their report status using a unique report code (no account required).
- **Confirmation Screen** — shows the unique report ID after successful persistence, with copy-to-clipboard.

### Command Center Dashboard
- **Real-time KPIs** — open incidents, critical incidents, available teams, resource shortages.
- **Interactive Map** — Leaflet/OpenStreetMap showing incidents (color-coded by priority), rescue teams, resource depots, and shelters with popups.
- **Priority Queue** — incidents ranked by priority score with one-click access to details.
- **Alerts Panel** — escalation notifications with acknowledge/dismiss.
- **Team Availability & Resource Summary** — at-a-glance status with low-stock warnings.
- **Activity Timeline** — audit log of all coordinator actions.

### Incident Management
- **Searchable, filterable incident list** — filter by type, priority, status, verification.
- **Incident detail page** — full information, priority reasons, location map, escalation history, audit trail, coordinator notes.
- **Verification controls** — verify, dispute, or flag reports.
- **Priority recalculation** — deterministic server-side scoring with audit trail.
- **Escalation simulation** — coordinators can simulate worsening conditions to test the escalation system.

### Rescue Team Recommendations & Assignments
- **Team recommendations** — ranked by capability match and straight-line distance.
- **Atomic assignment** — team reservation and resource deduction happen in a single atomic transaction; double-assignment is rejected.
- **Assignment lifecycle** — assigned → dispatched → completed/cancelled with full audit trail.
- **Resource release** — cancelling an assignment releases the team and reserved resources back to the pool.

### AI-Assisted Incident Understanding
- **Optional AI extraction** — a Supabase Edge Function extracts structured fields (incident category, trapped, injuries, vulnerable, danger increasing, people count) from free-text descriptions.
- **Deterministic fallback** — if no LLM API key is configured, a keyword-based extractor handles extraction so the application never blocks.
- **Human review required** — extracted information is displayed for coordinator confirmation; AI never makes dispatch decisions.

## Architecture

This project adapts the recommended MongoDB/Express/Socket.IO stack to **Supabase (PostgreSQL + Edge Functions + Realtime)**, which is the supported backend in this Bolt environment. All core requirements are preserved:

| Spec Requirement | Implementation |
|---|---|
| MongoDB + Mongoose | PostgreSQL with PostGIS (geospatial) |
| Express API | Postgres functions (RPC) + direct Supabase client |
| Socket.IO | Supabase Realtime (postgres_changes) |
| Server-side scoring | `calculate_priority()` Postgres function (deterministic, explainable) |
| Atomic assignment | `create_assignment()` Postgres function (SECURITY DEFINER) |
| Team recommendations | `recommend_teams()` Postgres function |
| Escalation detection | `recalculate_incident_priority()` Postgres function |
| LLM AI extraction | Supabase Edge Function with deterministic fallback |
| Auth | Demo coordinator mode (documented limitation — see below) |

### Tech Stack
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod, Leaflet/React-Leaflet, Recharts, Lucide React
- **Backend:** Supabase (PostgreSQL with PostGIS, Edge Functions, Realtime)
- **Maps:** Leaflet with OpenStreetMap tiles

## Priority Scoring Engine

The scoring engine is deterministic, explainable, and runs entirely on the server. Citizens never set priority — the system calculates it from reported conditions:

| Factor | Points |
|---|---|
| People trapped | +40 |
| Injuries/medical needs | +25 |
| Vulnerable people at risk | +15 |
| Danger increasing | +10 |
| People affected | up to +10 (min(10, people × 2)) |
| **Maximum** | **100** |

**Priority bands:** Critical (75–100), High (50–74), Moderate (25–49), Low (0–24)

**Unknown values remain unknown** — an unreported injury is treated as "unknown," never as "no." The system explicitly notes when information is missing and cannot assume safety.

Life-threatening reports (trapped or injured) are flagged for urgent review regardless of numeric score.

## Database Schema

Tables: `incidents`, `rescue_teams`, `resources`, `assignments`, `audit_logs`, `escalations`, `alerts`

Key functions: `calculate_priority()`, `recalculate_incident_priority()`, `recommend_teams()`, `create_assignment()`, `cancel_assignment()`

Row Level Security is enabled on all tables. The app uses a single-tenant demo mode (anon + authenticated policies) since no citizen auth is required for emergency reporting.

## Setup & Development

### Prerequisites
- Node.js 18+
- A Supabase project (or use the pre-provisioned Bolt instance)

### Installation
```bash
npm install
```

### Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase credentials:
```bash
cp .env.example .env
```

Required variables:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

### Running the App
```bash
npm run dev
```

### Building for Production
```bash
npm run build
npm run preview
```

### Seed Data
The database includes pre-loaded fictional demo data:
- 18 incidents across all priority levels and statuses
- 6 rescue teams with varied capabilities
- 7 resource/shelter locations
- 2 historical assignments

All demo data uses fictional coordinates and is clearly labeled. The seed migrations are idempotent (repeatable via `ON CONFLICT DO NOTHING`).

## API Reference

The frontend communicates with Supabase directly (anon key) for CRUD operations and via RPC for server-side functions:

| Operation | Method |
|---|---|
| Create incident | `INSERT INTO incidents` (priority auto-calculated by trigger) |
| List incidents | `SELECT FROM incidents` with filters |
| Recalculate priority | `RPC: recalculate_incident_priority(incident_id)` |
| Get team recommendations | `RPC: recommend_teams(incident_id)` |
| Create assignment | `RPC: create_assignment(incident_id, team_id, resource_ids[])` |
| Cancel assignment | `RPC: cancel_assignment(assignment_id, reason)` |
| Dashboard summary | Aggregated queries (KPIs computed from live data) |
| AI extraction | `POST /functions/v1/ai-extract` |

## Real-Time Updates

Supabase Realtime (postgres_changes) broadcasts changes on `incidents`, `rescue_teams`, `resources`, `assignments`, `alerts`, and `escalations` tables. The dashboard auto-refreshes when:
- A new report is submitted → appears in the queue and on the map
- An incident escalates → alert notification + priority update
- A team is assigned → team availability and resource quantities update

## Testing

### E2E Workflow Tests (verified)
1. ✅ Submit report → auto-scored by trigger → appears in database
2. ✅ Team recommendations → ranked by capability + distance
3. ✅ Atomic assignment → team reserved, resources deducted, incident status updated
4. ✅ Double-assignment → rejected with error
5. ✅ Cancel assignment → team and resources released
6. ✅ Escalation → conditions worsen → score increases → alert + escalation record created
7. Alert deduplication → recalculation without change → no duplicate escalation
8. ✅ AI extraction → edge function returns structured fields from free text
9. ✅ AI fallback → deterministic keyword extractor works without LLM API key

### Priority Scoring Edge Cases (verified via seed data)
- Unknown values are preserved as "unknown," never assumed false
- Life-threatening reports flagged regardless of score
- Maximum score capped at 100
- People-affected score capped at 10

## Limitations & Known Constraints

1. **Demo Coordinator Mode** — the coordinator dashboard does not require authentication. In a real deployment, coordinator-only actions (assign teams, verify reports, update status) would require Supabase Auth with email/password and RLS policies scoped to `authenticated`. This is clearly documented as a hackathon limitation.

2. **Straight-line distance** — team recommendations use geographic distance, not travel time or flood-safe routing. The UI explicitly labels this.

3. **Fictional demo data** — all incidents, teams, and resources use clearly labeled fictional data. No real emergencies are represented.

4. **AI extraction** — uses a deterministic keyword-based extractor. An LLM API can be layered above this with a fallback to the keyword extractor if the API is unavailable.

## Deployment

### Frontend (Vercel)
```bash
npm run build
# Deploy the dist/ directory to Vercel
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as environment variables
```

### Backend (Supabase)
- Database migrations are applied via the Supabase MCP tools
- Edge functions are deployed via the Supabase MCP deploy tool
- Realtime is enabled on all key tables

## Completed Features
- ✅ Citizen emergency report submission with map location
- ✅ Persistent storage with auto-generated report codes
- ✅ Deterministic, explainable priority scoring (server-side)
- ✅ Interactive map with incidents, teams, shelters, resources
- ✅ Command center dashboard with live KPIs
- ✅ Priority-ranked incident queue
- ✅ Searchable, filterable incident list
- ✅ Incident detail with verification, status, notes, audit trail
- ✅ Team recommendations ranked by capability + distance
- ✅ Atomic team assignment with resource reservation
- ✅ Assignment lifecycle (assigned → dispatched → completed → cancelled)
- ✅ Resource inventory with low-stock warnings
- ✅ Escalation detection with deduplication and alert notifications
- ✅ Real-time dashboard updates (Supabase Realtime)
- ✅ AI-assisted report extraction with deterministic fallback
- ✅ Report status lookup by report code
- ✅ Responsive design (desktop-first, tablet/mobile compatible)
