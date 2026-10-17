import type {
  Incident,
  RescueTeam,
  Resource,
  Assignment,
  Alert,
  AuditLog,
  Escalation,
  TeamRecommendation,
  RecalculateResult,
  IncidentType,
} from '@/types';
import type { CreateIncidentInput, DashboardSummary } from '@/hooks/useData';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `API request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Incidents
  getIncidents: async (filters?: {
    type?: IncidentType;
    priority?: string;
    status?: string;
    verification?: string;
    limit?: number;
  }): Promise<Incident[]> => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.verification) params.append('verification', filters.verification);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const res = await fetch(`${BASE_URL}/incidents?${params.toString()}`);
    return handleResponse<Incident[]>(res);
  },

  getIncident: async (id: string): Promise<Incident | null> => {
    const res = await fetch(`${BASE_URL}/incidents/${id}`);
    if (res.status === 404) return null;
    return handleResponse<Incident>(res);
  },

  getIncidentByReportCode: async (reportCode: string): Promise<Incident | null> => {
    const res = await fetch(`${BASE_URL}/incidents/code/${encodeURIComponent(reportCode)}`);
    if (res.status === 404) return null;
    return handleResponse<Incident>(res);
  },

  createIncident: async (input: CreateIncidentInput): Promise<Incident> => {
    const res = await fetch(`${BASE_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<Incident>(res);
  },

  updateIncident: async (id: string, updates: Partial<Incident>): Promise<Incident> => {
    const res = await fetch(`${BASE_URL}/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Incident>(res);
  },

  recalculatePriority: async (incidentId: string, actor = 'coordinator'): Promise<RecalculateResult> => {
    const res = await fetch(`${BASE_URL}/incidents/${incidentId}/recalculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor }),
    });
    return handleResponse<RecalculateResult>(res);
  },

  // Teams
  getTeams: async (): Promise<RescueTeam[]> => {
    const res = await fetch(`${BASE_URL}/teams`);
    return handleResponse<RescueTeam[]>(res);
  },

  createTeam: async (input: {
    name: string;
    capabilities: string[];
    equipment: string[];
    capacity: number;
    latitude: number;
    longitude: number;
  }): Promise<RescueTeam> => {
    const res = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<RescueTeam>(res);
  },

  updateTeam: async (id: string, updates: Partial<RescueTeam> & { latitude?: number; longitude?: number }): Promise<RescueTeam> => {
    const res = await fetch(`${BASE_URL}/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<RescueTeam>(res);
  },

  getTeamRecommendations: async (incidentId: string): Promise<TeamRecommendation[]> => {
    const res = await fetch(`${BASE_URL}/teams/recommendations/${incidentId}`);
    return handleResponse<TeamRecommendation[]>(res);
  },

  // Resources
  getResources: async (): Promise<Resource[]> => {
    const res = await fetch(`${BASE_URL}/resources`);
    return handleResponse<Resource[]>(res);
  },

  createResource: async (input: {
    name: string;
    type: string;
    quantity_available: number;
    quantity_reserved: number;
    latitude?: number;
    longitude?: number;
    low_stock_threshold: number;
  }): Promise<Resource> => {
    const res = await fetch(`${BASE_URL}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<Resource>(res);
  },

  updateResource: async (id: string, updates: Partial<Resource> & { latitude?: number; longitude?: number }): Promise<Resource> => {
    const res = await fetch(`${BASE_URL}/resources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Resource>(res);
  },

  // Assignments
  getAssignments: async (): Promise<Assignment[]> => {
    const res = await fetch(`${BASE_URL}/assignments`);
    return handleResponse<Assignment[]>(res);
  },

  getAssignmentsForIncident: async (incidentId: string): Promise<Assignment[]> => {
    const res = await fetch(`${BASE_URL}/assignments/incident/${incidentId}`);
    return handleResponse<Assignment[]>(res);
  },

  createAssignment: async (input: { incidentId: string; teamId: string; resourceIds: string[]; actor?: string }): Promise<string> => {
    const res = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await handleResponse<{ assignment_id: string }>(res);
    return data.assignment_id;
  },

  updateAssignment: async (id: string, updates: Partial<Assignment>): Promise<Assignment> => {
    const res = await fetch(`${BASE_URL}/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Assignment>(res);
  },

  cancelAssignment: async (assignmentId: string, reason = '', actor = 'coordinator'): Promise<void> => {
    const res = await fetch(`${BASE_URL}/assignments/${assignmentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, actor }),
    });
    await handleResponse<{ message: string }>(res);
  },

  // Alerts
  getAlerts: async (): Promise<Alert[]> => {
    const res = await fetch(`${BASE_URL}/alerts`);
    return handleResponse<Alert[]>(res);
  },

  acknowledgeAlert: async (alertId: string): Promise<Alert> => {
    const res = await fetch(`${BASE_URL}/alerts/${alertId}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<Alert>(res);
  },

  // Escalations & Audit Logs
  getEscalations: async (incidentId: string): Promise<Escalation[]> => {
    const res = await fetch(`${BASE_URL}/escalations/${incidentId}`);
    return handleResponse<Escalation[]>(res);
  },

  getAuditLogs: async (entityType?: string, entityId?: string, limit = 20): Promise<AuditLog[]> => {
    const params = new URLSearchParams();
    if (entityType) params.append('entityType', entityType);
    if (entityId) params.append('entityId', entityId);
    params.append('limit', String(limit));

    const res = await fetch(`${BASE_URL}/audit-logs?${params.toString()}`);
    return handleResponse<AuditLog[]>(res);
  },

  // Dashboard summary
  getDashboardSummary: async (): Promise<DashboardSummary> => {
    const res = await fetch(`${BASE_URL}/dashboard/summary`);
    return handleResponse<DashboardSummary>(res);
  },
};
