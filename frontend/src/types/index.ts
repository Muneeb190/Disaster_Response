export type IncidentType = 'flood' | 'fire' | 'medical_emergency' | 'heatwave' | 'other';
export type TriState = 'yes' | 'no' | 'unknown';
export type PriorityLevel = 'critical' | 'high' | 'moderate' | 'low';
export type IncidentStatus = 'reported' | 'verified' | 'assigned' | 'dispatched' | 'resolved' | 'cancelled';
export type VerificationStatus = 'pending' | 'verified' | 'disputed' | 'flagged';
export type TeamStatus = 'available' | 'assigned' | 'en_route' | 'unavailable' | 'offline';
export type AssignmentStatus = 'assigned' | 'dispatched' | 'completed' | 'cancelled';

export interface Incident {
  id: string;
  report_code: string;
  type: IncidentType;
  description: string;
  area_landmark: string | null;
  people_affected: number;
  people_trapped: TriState;
  injuries_reported: TriState;
  vulnerable_people: TriState;
  danger_increasing: TriState;
  location: string; // GeoJSON in PostGIS, comes as GeoJSON string from API
  priority_score: number;
  priority_level: PriorityLevel;
  priority_reasons: string[];
  life_threatening: boolean;
  previous_priority_score: number | null;
  previous_priority_level: PriorityLevel | null;
  verification_status: VerificationStatus;
  status: IncidentStatus;
  assigned_team_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  ai_extracted: Record<string, unknown> | null;
  coordinator_notes: string | null;
  photo_url: string | null;
  reporter_user_id?: string | null;
  is_demo?: boolean;
  data_source?: string;
  created_at: string;
  updated_at: string;
  // Feature 12: follow-up question
  followup_question: string | null;
  followup_field: string | null;
  followup_answer: TriState | null;
  followup_skipped: boolean;
  // Feature 13: risk score with reasons
  risk_factors: RiskFactor[];
  // Feature 14: information confidence
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reasons: ConfidenceReason[];
  matching_report_count: number;
  needs_urgent_check: boolean;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type FactStatus = 'reported' | 'followup' | 'unknown';

export interface RiskFactor {
  key: string;
  label: string;
  points: number;
  status: FactStatus;
  detail: string | null;
}

export interface ConfidenceReason {
  label: string;
  delta: number;
}

export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  reported: 'Reported',
  followup: 'Answered in follow-up',
  unknown: 'Not yet known',
};

export interface RescueTeam {
  id: string;
  team_code: string;
  name: string;
  capabilities: string[];
  equipment: string[];
  capacity: number;
  status: TeamStatus;
  location: string | null;
  current_assignment_id: string | null;
  last_location_update: string | null;
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  quantity_available: number;
  quantity_reserved: number;
  location: string | null;
  low_stock_threshold: number;
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export type ShelterStatus = 'open' | 'full' | 'closed';

export interface Shelter {
  id: string;
  name: string;
  address: string | null;
  location: string | null;
  capacity: number;
  occupancy: number;
  status: ShelterStatus;
  // null = not confirmed
  wheelchair_access: boolean | null;
  medical_support: boolean | null;
  family_area: boolean | null;
  has_power: boolean | null;
  notes: string | null;
  is_demo: boolean;
  last_updated_at: string;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  details: Record<string, unknown> | null;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export interface Assignment {
  id: string;
  incident_id: string;
  team_id: string;
  resource_ids: string[];
  status: AssignmentStatus;
  assigned_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  actor_user_id?: string | null;
  actor_role?: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export interface Escalation {
  id: string;
  incident_id: string;
  previous_score: number | null;
  new_score: number | null;
  previous_level: PriorityLevel | null;
  new_level: PriorityLevel | null;
  reason: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  incident_id: string | null;
  type: string;
  severity: PriorityLevel;
  message: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  dedup_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  incidents?: { report_code: string } | null;
  profiles?: { full_name: string; email: string } | null;
}

export interface TeamRecommendation {
  team_id: string;
  team_name: string;
  team_code: string;
  capabilities: string[];
  distance_km: number;
  capability_match: number;
  recommendation_reason: string;
  current_status: TeamStatus;
}

export interface RecalculateResult {
  new_score: number;
  new_level: PriorityLevel;
  reasons: string[];
  life_threatening: boolean;
  escalated: boolean;
}

// PostgREST returns geography columns as hex EWKB, e.g. 0101000020E6100000<x><y>.
function parseEwkbPoint(hex: string): [number, number] | null {
  const bytes = new Uint8Array(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));
  if (bytes.length < 21) return null;
  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian);
  if ((type & 0xff) !== 1) return null; // not a point
  const offset = type & 0x20000000 ? 9 : 5; // skip SRID when present
  if (bytes.length < offset + 16) return null;
  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  return [lat, lng];
}

// Parse a geography point (hex EWKB, WKT or GeoJSON) into [lat, lng]
export function parseLocation(loc: string | null | undefined): [number, number] | null {
  if (!loc) return null;
  try {
    if (typeof loc === 'string' && /^[0-9A-Fa-f]+$/.test(loc)) return parseEwkbPoint(loc);
    // PostGIS geography comes as "POINT(lng lat)" string from supabase-js
    const match = loc.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
    if (match) {
      return [parseFloat(match[2]), parseFloat(match[1])]; // [lat, lng]
    }
    // Or as GeoJSON
    const geo = typeof loc === 'string' ? JSON.parse(loc) : loc;
    if (geo?.type === 'Point' && Array.isArray(geo.coordinates)) {
      return [geo.coordinates[1], geo.coordinates[0]];
    }
  } catch {
    // ignore
  }
  return null;
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  flood: 'Flood',
  fire: 'Fire',
  medical_emergency: 'Medical Emergency',
  heatwave: 'Heatwave',
  other: 'Other',
};

export const INCIDENT_TYPE_ICONS: Record<IncidentType, string> = {
  flood: 'Waves',
  fire: 'Flame',
  medical_emergency: 'HeartPulse',
  heatwave: 'ThermometerSun',
  other: 'AlertTriangle',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: 'Reported',
  verified: 'Verified',
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  disputed: 'Disputed',
  flagged: 'Flagged',
};

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  available: 'Available',
  assigned: 'Busy',
  en_route: 'Travelling',
  unavailable: 'Unavailable',
  offline: 'Offline',
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  critical_incident: 'Critical incident',
  escalation: 'Escalation',
  assignment: 'Assignment',
  assignment_cancelled: 'Assignment cancelled',
  team_unavailable: 'Team unavailable',
  low_stock: 'Low stock',
  shelter_near_full: 'Shelter capacity',
  backup_request: 'Backup request',
};

export const TEAM_MARKER_COLORS: Record<TeamStatus, string> = {
  available: '#16a34a',
  assigned: '#d97706',
  en_route: '#2563eb',
  unavailable: '#dc2626',
  offline: '#6b7280',
};
