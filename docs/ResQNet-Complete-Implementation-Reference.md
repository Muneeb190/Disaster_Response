# ResQNet — Complete Implementation Reference

Oct 18, 2026 · @Hanfahad

## 1. Mission

ResQNet must answer one challenge from CODE//CONNECT'26 Problem 01: **how can technology identify who needs help most and coordinate available resources to reach them before the situation becomes critical?**

**Pitch:** ResQNet finds the people most at risk, including those who never send a report, explains why they should be helped first, and coordinates the fastest feasible response, even when information is incomplete or the network fails.

Every feature must answer at least one of the brief's three questions:

| Question | What the brief means |
| --- | --- |
| **Q1. Who is most at risk?** | Vulnerability depends on location, age, health, mobility, housing and access to information. Find people when warnings do not reach everyone. |
| **Q2. Who gets help first?** | Teams, vehicles, shelters and supplies are finite. Match scarce resources to the greatest need and justify the order. |
| **Q3. How early can you act?** | Act before conditions become critical: warnings, forecasts, crowd reports and pre-positioning resources. |

It must also survive three hard conditions: **incomplete information** (late, duplicated, inaccurate or missing reports), **competing priorities** (one team, many emergencies) and **connectivity failure**.

The brief names four affected groups: residents of flood-prone and low-lying areas with no early warning; elderly, disabled, chronically ill or isolated people who cannot self-evacuate; rescue coordinators with limited vehicles; and shelter and relief managers balancing capacity against demand.

Roles: **Public** (no login needed to report), **Responder** (sees only their team's assignments) and **Admin/Coordinator** (full operations). The vulnerable resident who never opens the app is the unseen fourth user. Features 63–68 exist for them.

## 2. Where we stand

Of the original 62 features, **31 are done, 19 are partial and 12 are not started** (verified on commit `95364e6`). Reporting, AI triage and the command centre (1–30) are about 90% complete. The weak areas are the responder app, offline sync, dispatch planning and early warnings.

| Area | Features | Done | Partial | Not started |
| --- | --- | --- | --- | --- |
| Citizen reporting | 1–10 | 6 | 3 | 1 |
| AI understanding and verification | 11–20 | 9 | 1 | 0 |
| Coordinator command centre | 21–30 | 10 | 0 | 0 |
| Dispatch and resource planning | 31–38 | 1 | 6 | 1 |
| Responder field app | 39–45 | 0 | 4 | 3 |
| Early warnings and public safety | 46–49 | 1 | 1 | 2 |
| Security, reliability, accessibility | 50–57 | 3 | 4 | 1 |
| Future enhancements | 58–62 | 1 | 0 | 4 |

**Blocker before anything else:** Vercel is still serving the old bundle (`index-Bm9SXBZF.js`). Fix the deployment so `main` goes live, or judges will see an older app.

## 3. Problem statement coverage

Today ResQNet answers Q2 (who gets help first) well, but Q1 and Q3 only for people who send a report. The new features 63–74 close that gap. Every line of the brief is mapped below.

| Brief requirement | Covered by | Today | After plan |
| --- | --- | --- | --- |
| Vulnerability by **location** | 4, 22, 47, **66** | Partial: incident location only | Full: area profile per neighbourhood |
| Vulnerability by **age, health, mobility** | 11, 13, **63, 64** | Partial: only if the reporter mentions it | Full: proxy flags and at-risk register |
| Vulnerability by **housing and access to information** | **66, 67** | Missing | Full: housing and signal in area index; silent zones |
| Find people **when warnings don't reach everyone** | **64, 65, 67, 68** | Missing | Full: check-ins, silent zones, proactive checks |
| People **without smartphones or signal** | 9, 10, **58, 63** | Partial | Full: proxy reports, SMS, offline |
| **Isolated people who cannot self-evacuate** | **63, 64, 70** | Missing | Full: register + pre-hazard evacuation help |
| **Match scarce resources** to greatest need | 13, 23, 31–33, 37 | Partial: capability + distance | Full: equipment, capacity, ETA |
| **Justify priority order** in a way responders trust | 13, 14, 19, 20, 30 | Done | Done |
| **Act before it becomes critical** | 18, 46–48, **69, 70** | Partial: escalation only | Full: warning feed + pre-positioning |
| **Forecasts and pre-positioning** | 46, **69** | Missing | Full: rule-based pre-positioning |
| **Heatwaves** (named in brief), not only floods | **71** | Missing | Full: hazard-specific risk |
| Incomplete info: **late** | 18, 14 | Done | Done |
| Incomplete info: **duplicated** | 15, 16 | Done | Done |
| Incomplete info: **inaccurate** | 14, 17, 20 | Done | Done |
| Incomplete info: **missing entirely from some areas** | **67, 73** | Missing | Full: silent zones + coverage view |
| **Competing priorities** | 23, 34, 36 | Partial | Full: multi-incident plan + replanning |
| **Connectivity failure** | 9, 44, 52, 53, 58 | Partial: PWA shell only | Full: outbox, safe sync, SMS |
| **Rescue coordinators** with limited vehicles | 21–37 | Mostly done | Full |
| **Shelter and relief managers** balancing capacity vs demand | 8, 27, **72** | Partial: capacity only | Full: demand forecast + overflow warning |
| Ground rule: **working prototype** | 74 + deployment fix | At risk (old deploy) | Full: scripted live scenario |
| Ground rule: **explain trade-offs** | Section 8 | Not prepared | Trade-offs slide |
| Ground rule: **behaviour with bad data** | 14, 17, 20, 57 | Done | Demo it explicitly |

Bold feature numbers are new (Section 5).

## 4. All 62 features: status and what's left

The Status column is a dropdown, so update it as you finish features. The Phase column links to the build order in Section 7. Three features are marked Cut (59, 61, 62) for the reasons in Section 6.

| # | Feature | Status | What's left | Phase |
| --- | --- | --- | --- | --- |
| 1 | Simple emergency report | Done | Add "reporting for someone else" toggle (feature 63) | B |
| 2 | Voice emergency reporting | Done | Nothing | — |
| 3 | Urdu and English voice | Done | Nothing | — |
| 4 | Automatic location sharing | Done | Nothing | — |
| 5 | Photo and video evidence | Not started | **Photos only**: private storage upload, compressed, coordinator view | A |
| 6 | Quick emergency submission | Done | Nothing | — |
| 7 | Emergency tracking code | Done | Nothing | — |
| 8 | Nearby shelter suggestions | Partial | Show suitable shelters on citizen confirmation and tracking screens, with last-updated time | A |
| 9 | Offline emergency reporting | Partial | Queue the whole report in IndexedDB; auto-send once on reconnect | E |
| 10 | Low-data reporting mode | Partial | Explicit low-data toggle; send text first, photo later | E |
| 11 | AI report understanding | Done | Extract proxy and vulnerability flags too | B |
| 12 | Smart follow-up questions | Done | Nothing | — |
| 13 | Emergency risk score | Done | Add area vulnerability, hazard zone and hazard type factors (66, 71) | B |
| 14 | Information confidence score | Done | Nothing | — |
| 15 | Duplicate report detection | Done | Nothing | — |
| 16 | Combining reports | Done | Nothing | — |
| 17 | Evidence review and verification | Partial | Done once photo upload (5) lands | A |
| 18 | Automatic urgency updates | Done | Nothing | — |
| 19 | Clear priority reasons | Done | Nothing | — |
| 20 | Human review and correction | Done | Nothing | — |
| 21 | Live emergency dashboard | Done | Add silent zones and pre-positioning panels | B |
| 22 | Interactive emergency map | Done | Add area vulnerability and silent-zone layers | B |
| 23 | Priority emergency queue | Done | Add "proactive check" lane | B |
| 24 | Incident details and history | Done | Nothing | — |
| 25 | Team availability board | Done | Nothing | — |
| 26 | Rescue resource inventory | Done | Nothing | — |
| 27 | Shelter capacity management | Done | Add expected arrivals (72) | D |
| 28 | Realtime alerts | Done | Nothing | — |
| 29 | Operations summary report | Done | Add silent zones, check-in results and pre-positioning | F |
| 30 | Activity and decision history | Done | Nothing | — |
| 31 | Smart team recommendations | Partial | Score equipment availability and team capacity | C |
| 32 | Travel time estimates | Partial | Team-to-incident ETA via OpenRouteService (already integrated), labelled estimate | C |
| 33 | Equipment and capacity matching | Partial | Requirement validator with explicit warnings ("no boat") | C |
| 34 | Multiple emergency planning | Not started | Greedy allocation across critical incidents with coverage-gap check and per-choice reasons | C |
| 35 | Road closure and route updates | Partial | Road-closure editor (draw line/area, source, trust level); routes avoid it | C |
| 36 | Automatic dispatch recalculation | Partial | Produce a replacement plan, not just an alert | C |
| 37 | Assignment approval and cancellation | Done | Nothing | — |
| 38 | Resource movement tracking | Partial | Ledger with source and destination (needed for pre-positioning) | C |
| 39 | Responder login and jobs | Partial | Show required equipment, risks, vulnerable people on the card | A |
| 40 | Accept or reject assignment | Partial | Reject with reason; coordinator alerted | A |
| 41 | One-tap status updates | Partial | Add Arrived, Victim reached, Needs backup | A |
| 42 | Live team location sharing | Partial | **Reduced**: send GPS with each status tap, not continuous tracking | A |
| 43 | Request backup | Not started | Backup button + RPC + critical alert linked to incident | A |
| 44 | Offline field updates | Not started | Cache assignments; queue status taps; ordered sync | E |
| 45 | Rescue completion report | Not started | People reached, supplies used (writes ledger), further help needed | A |
| 46 | Weather and warning feeds | Not started | One real feed (e.g. Open-Meteo rain/heat) into `hazard_events`; simulated fallback labelled | D |
| 47 | Danger zone map layers | Done | Add official/feed zones beside provisional ones | D |
| 48 | Early risk escalation | Partial | Feed warnings flag incidents, at-risk register entries and areas | D |
| 49 | Public safety instructions | Not started | Curated, sourced guidance per hazard type (Urdu + English) after submission | A |
| 50 | Secure roles and permissions | Done | Add RLS for new tables (register is admin-only) | B |
| 51 | Private evidence and personal info | Partial | Retention rules; consent for register; photo privacy | F |
| 52 | Offline app installation | Partial | Global online / offline / syncing banner | E |
| 53 | Safe synchronization | Not started | Idempotency keys, `sync_operations`, conflict review | E |
| 54 | Reliable notifications | Partial | **Reduced**: in-app only; track sent / failed / acknowledged | F |
| 55 | Accessible and simple interface | Done | Check new screens on a small phone | F |
| 56 | System health and monitoring | Partial | **Reduced**: small status bar (intake, AI, realtime, feed, sync) | F |
| 57 | Clearly marked demo data | Done | Label seeded vulnerability and register data | B |
| 58 | SMS emergency reporting | Not started | **Promoted**: inbound webhook + labelled simulated SMS inbox | E |
| 59 | AI photo damage review | Cut | Cut (Section 6) | — |
| 60 | Evacuation route suggestions | Done | Keep; reuse for feature 70 | — |
| 61 | Future demand estimates | Cut | Cut; replaced by 69 | — |
| 62 | Public disaster updates | Cut | Cut (Section 6) | — |

## 5. New features to add (63–74)

These twelve features take ResQNet from "responds to reports" to "finds people before they report." Features 63–68 are the main differentiator, so build them properly rather than as an afterthought.

### Finding people who don't report (Q1)

**63. Report on behalf of someone else.** Report form toggle: "I'm reporting for a neighbour or relative." Relationship field and checkboxes: elderly, cannot walk, disabled, child, pregnant, needs medicine or oxygen, lives alone, has no phone. Flags feed the risk score (+5 for "no phone"). *Brief:* people without smartphones; isolated people who cannot self-evacuate.

**64. At-risk residents register.** Opt-in, before any disaster. A person or carer registers location and needs (wheelchair, dialysis, oxygen, bedridden, lives alone, preferred language, contact). Consent is explicit; only admins can see it. When a warning covers the address, the person appears on the map automatically. *Brief:* elderly, disabled, chronically ill or isolated people.

**65. Warning check-in ("Are you safe?").** When a warning is issued, registered people in the zone get an in-app (and simulated SMS) check-in: "I'm safe" / "I need help." No reply within a set time (e.g. 30 minutes) creates a welfare-check task. "I need help" creates an incident directly. *Brief:* warnings do not reach everyone.

**66. Area vulnerability layer.** An `areas` table of neighbourhood polygons with: low-lying flag, elderly share, living-alone share, low-income indicator, poor-housing share, disability share, mobile-signal quality, population. Combined into a 0–1 vulnerability index with visible weights. Seeded demo data, clearly labelled. *Brief:* location, age, health, mobility, housing and access to information.

**67. Silent zones.** An area becomes a silent zone when it is inside an active hazard zone, has vulnerability index ≥ 0.6, and has fewer reports than expected in the last 3 hours (e.g. population ÷ 2000, minimum 1). Shown on the map and in a panel with its reason, e.g. "Flood warning, 34% elderly, poor signal, 0 reports in 3 h." *Brief:* data missing entirely from some areas.

**68. Proactive welfare checks.** One click turns a silent zone or unanswered check-in into a `proactive_check` incident that goes through normal dispatch. It has its own lane in the queue.

### Acting early (Q3)

**69. Pre-positioning suggestions.** Under an active warning, for each high-risk area: if no capable, available team is within the ETA threshold (e.g. 20 minutes), suggest moving a team or supplies closer. Admin approves; the move is written to the resource ledger (38). *Brief:* pre-positioning of resources rather than reacting after the fact.

**70. Pre-hazard evacuation assistance.** People from the register or proxy reports who cannot self-evacuate are listed for transport before conditions turn critical. Matched to accessible vehicles and suitable shelters; reuses the wheelchair routes from feature 60.

**71. Hazard-specific risk.** The risk score weights factors by hazard type. Heatwave: elderly, chronic illness, lives alone, no cooling or power. Flood: low-lying, ground-floor home, cannot walk. The brief names heatwaves, so the system must not be flood-only.

### Shelters and fairness (Q2)

**72. Shelter demand vs capacity.** Expected arrivals (from evacuations and assignments) against spaces left per shelter. Warn before overflow; suggest where the next group should go. *Brief:* shelter managers balancing capacity against demand.

**73. Coverage and fairness view.** Per area: median response time, unanswered incidents, distance to nearest team, reports per 1,000 people. Highlights areas being left behind, which shows the system does not favour people with good phones and signal.

### Demo strength

**74. Disaster scenario timeline.** One-click scripted scenario, clearly labelled as simulated: warning issued → silent zone appears → reports arrive → network drops → team becomes unavailable. Includes a reset button. The whole system reacts live and the demo can be repeated.

## 6. What to cut, reduce and merge

Cut three features, reduce four, and present the rest as eight grouped capabilities so the list reads as focused rather than padded.

### Cut

| # | Feature | Why |
| --- | --- | --- |
| 59 | AI photo damage review | Not asked for in the brief; unreliable; invites accuracy questions from judges |
| 61 | Future demand estimates | Replaced by 69 (pre-positioning): simpler, explainable, demoable now |
| 62 | Public disaster updates | Not in the brief; feature 8 already shows shelters to the public |

**Keep 60 (evacuation routes).** It's already built with advisory labels and wheelchair routes, and feature 70 reuses it.

### Reduce

| # | Feature | Reduced to | Why |
| --- | --- | --- | --- |
| 5 | Photo and video | Photos only, compressed | Video conflicts with low-data mode and slow networks |
| 42 | Live team location | GPS sent with each status tap | Simpler, saves battery, enough for ETA and "last seen" |
| 54 | Notifications | In-app with sent / failed / acknowledged tracking | Push and SMS delivery cost time and money for little demo value |
| 56 | System health | Small status bar | A full monitoring dashboard won't be judged |

### Merge in the pitch (keep building all of them)

| Capability | Features |
| --- | --- |
| Explainable risk and confidence | 13, 14, 18, 19 |
| Duplicates and verification | 15, 16, 17, 20 |
| Smart dispatch | 31, 32, 33, 37 |
| Adaptive planning | 34, 35, 36 |
| Inventory and movement ledger | 26, 38 |
| Responder field app | 39–43, 45 |
| Offline and safe sync | 9, 10, 44, 52, 53, 58 |
| Warnings and early action | 46, 47, 48, 69, 70 |
| **Finding the unseen** (new) | 63–68, 71 |

## 7. Build order

Build in six phases. Each one ends with a working, deployed app, so you always have something demoable. Phase B is the differentiator; don't let it slip to the end.

### Phase 0: Unblock (do today)

- [ ] Fix Vercel so commit `95364e6` and later are live; confirm the bundle hash changed
- [ ] Confirm all exposed keys and tokens were rotated

### Phase A: Finish the core loop

- [ ] 39 Responder card: equipment, risks, vulnerable people
- [ ] 40 Reject with reason
- [ ] 41 Arrived, Victim reached, Needs backup buttons
- [ ] 42 GPS sent with each status tap
- [ ] 43 Backup request RPC + critical alert
- [ ] 45 Completion report (writes supplies used)
- [ ] 5 / 17 Private photo upload + coordinator view
- [ ] 8 Shelters on citizen confirmation screen
- [ ] 49 Curated safety instructions (Urdu + English)

*Done when:* report → assign → Arrived → Needs backup → Completed works on a real phone.

### Phase B: Finding the unseen

- [ ] 66 `areas` table + vulnerability index + map layer (seeded, labelled)
- [ ] 63 Proxy reporting + vulnerability checkboxes; 11 extracts these flags
- [ ] 64 At-risk register (consent, admin-only RLS)
- [ ] 71 Hazard-specific risk weights; 13 uses area index and hazard type
- [ ] 67 Silent-zone detection + panel + map layer
- [ ] 68 Proactive check incidents + queue lane
- [ ] 65 "Are you safe?" check-in + no-reply escalation

*Done when:* a high-vulnerability area with zero reports is flagged, turned into a proactive check, and assigned a team.

### Phase C: Smarter dispatch

- [ ] 31 / 33 Equipment and capacity validator with warnings
- [ ] 32 Team ETA via OpenRouteService, labelled estimate
- [ ] 35 Road-closure editor; routes and ETA avoid closures
- [ ] 38 Movement ledger with source and destination
- [ ] 34 Multi-incident allocation with per-choice reasons
- [ ] 36 Automatic replacement plan on team loss or road closure
- [ ] 73 Coverage and fairness view

*Done when:* closing a road or losing a team changes the plan, and the reason is shown.

### Phase D: Acting early

- [ ] 46 One real warning feed into `hazard_events`, with source, age and simulated fallback
- [ ] 47 / 48 Feed zones on map; flag incidents, register entries, areas
- [ ] 69 Pre-positioning suggestions + approval
- [ ] 70 Pre-hazard evacuation list with accessible vehicles
- [ ] 72 / 27 Shelter demand vs capacity + overflow warning

*Done when:* a warning triggers check-ins, pre-positioning and an evacuation list before any report arrives.

### Phase E: Offline and low-signal

- [ ] 53 Idempotency keys + `sync_operations` + conflict review
- [ ] 9 Full report outbox, auto-send on reconnect
- [ ] 44 Cached assignments + queued status taps, ordered sync
- [ ] 52 Online / offline / syncing banner
- [ ] 10 Low-data mode
- [ ] 58 SMS webhook + labelled simulated SMS inbox

*Done when:* with the network off, a report and "Arrived + Needs backup" sync exactly once on reconnect.

### Phase F: Polish and proof

- [ ] 74 Scenario timeline + one-command reset
- [ ] 29 Situation report includes silent zones and check-ins
- [ ] 54, 56 Notification tracking + status bar
- [ ] 51 Retention rules and consent text
- [ ] Tests: risk score, silent-zone rule, duplicates, RLS, double assignment, negative stock, invalid transitions, offline retry, LLM fallback, one end-to-end run
- [ ] Code splitting, small-phone check (55)
- [ ] Record a backup demo video

## 8. Winning the jury

The moment to build the demo around is ResQNet finding people who never reported. Lead with that, then show the core loop surviving bad data and a network failure.

### Demo script (5 minutes)

1. **Warning arrives (0:00).** Start the scenario (74). A heavy-rain warning covers the riverside. Risk recalculates; check-ins (65) go to registered residents.
2. **The silent zone (0:40).** The map flags a low-lying area: 34% elderly, poor signal, 0 reports. One registered dialysis patient hasn't answered. Create a proactive check (68) and pre-position a boat team (69). *"Nobody here reported. ResQNet found them anyway."*
3. **Chaotic voice report (1:30).** A neighbour speaks in mixed Urdu–English: grandmother can't walk, children upstairs, water rising. The form fills itself, marks it as a proxy report and asks "Is anyone trapped?"
4. **Priority with reasons (2:10).** The incident jumps to Critical with every factor shown. Two more reports of the same street merge in and raise confidence, not the incident count.
5. **Dispatch (2:50).** The recommendation picks the boat team and explains why the closer team wasn't chosen (no boat). A road closes; the plan recalculates with a reason.
6. **Network fails (3:30).** The responder goes offline, taps Arrived and Needs backup, then reconnects. Events sync once, in order.
7. **Command picture (4:15).** Backup alert, updated inventory, suitable shelter with overflow warning, coverage view and a generated situation report.

Close with metrics computed from the scenario: time from report to verified priority, reports merged per incident, silent zones found and checked, offline actions synced without duplicates, and response time by area.

### Ground-rule answers to prepare

| Judges ask | Our answer |
| --- | --- |
| What happens with **incomplete data**? | High risk + low confidence goes to the top as "Urgent verification." Missing areas become silent zones. Unknown facts are listed, not guessed. |
| What happens with **wrong data**? | Original words always kept; a human approves every dispatch; overrides need a reason and are logged; wrong merges can be split. |
| What about **duplicates**? | Suggested to a coordinator, never auto-merged. Corroboration raises confidence, not the incident count. |
| What if **the network fails**? | Reports and field updates queue on the phone and sync once. SMS is a backup path. The UI always shows offline status. |
| What about people **without phones**? | Proxy reports, the at-risk register, check-ins and silent zones. |
| Is the **AI** trustworthy? | AI only extracts facts. Scoring is rule-based and every point is shown. Keyword fallback if the LLM fails. |
| Is the data **real**? | Seeded and simulated data carries a visible demo label everywhere. One live warning feed shows its source and age. |

### Trade-offs slide

- **Rule-based scoring, not an ML model:** explainable and auditable; AI is limited to extraction.
- **Human approval on every dispatch:** a few seconds slower, but no automated mistakes.
- **Seeded vulnerability data:** real census or local-government data replaces it in deployment.
- **Greedy multi-incident allocation, not a full optimiser:** fast, explainable, good enough at this scale.
- **Photos only, GPS per status tap, in-app notifications:** saves bandwidth and battery when networks are weakest.
- **Cut:** AI photo analysis, demand forecasting, public updates page, and why each was cut.

### Extra touches that impress

- Show **"why not"** for every recommendation, not only "why."
- A **fairness number** on screen: response time in high- vs low-vulnerability areas.
- **Urdu interface toggle** for citizen screens.
- A **"What changed?"** diff each time an incident's priority moves.
- A one-page **architecture diagram** and a short **privacy statement** (consent, retention, who sees what).

