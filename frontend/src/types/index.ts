export type IncidentType = 'flood' | 'fire' | 'medical_emergency' | 'heatwave' | 'other';
export type TriState = 'yes' | 'no' | 'unknown';
export type PriorityLevel = 'critical' | 'high' | 'moderate' | 'low';
export type IncidentStatus = 'reported' | 'verified' | 'assigned' | 'dispatched' | 'resolved' | 'cancelled';
export type VerificationStatus = 'pending' | 'verified' | 'disputed' | 'flagged';
export type TeamStatus = 'available' | 'assigned' | 'offline';
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
  voice_recording_id?: string | null;
  ai_extracted: Record<string, unknown> | null;
  coordinator_notes: string | null;
  photo_url: string | null;
  reporter_user_id?: string | null;
  is_demo?: boolean;
  data_source?: string;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
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
  created_at: string;
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
  dedup_key: string | null;
  created_at: string;
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

// Parse a GeoJSON/geography point into [lat, lng]
export function parseLocation(loc: string | null | undefined): [number, number] | null {
  if (!loc) return null;
  try {
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
  assigned: 'Assigned',
  offline: 'Offline',
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
