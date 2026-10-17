import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Alert,
  Assignment,
  AuditLog,
  Escalation,
  Incident,
  IncidentType,
  RecalculateResult,
  RescueTeam,
  Resource,
  TeamRecommendation,
  TriState,
} from '@/types';

export interface CreateIncidentInput {
  type: IncidentType;
  description: string;
  area_landmark?: string;
  people_affected: number;
  people_trapped: TriState;
  injuries_reported: TriState;
  vulnerable_people: TriState;
  danger_increasing: TriState;
  latitude: number;
  longitude: number;
  reporter_name?: string;
  reporter_phone?: string;
  voice_recording_id?: string | null;
}

export interface DashboardSummary {
  openIncidents: number;
  criticalIncidents: number;
  availableTeams: number;
  resourceShortages: number;
  totalIncidents: number;
  resolvedIncidents: number;
  totalTeams: number;
  totalResources: number;
  activeAssignments: number;
  unacknowledgedAlerts: number;
}

export function useIncidents(filters?: {
  type?: IncidentType;
  priority?: string;
  status?: string;
  verification?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.priority) params.set('priority', filters.priority);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.verification) params.set('verification', filters.verification);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api.get<Incident[]>(`/api/incidents${qs}`);
    },
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get<Incident | null>(`/api/incidents/${id}`),
    enabled: !!id,
  });
}

export function useIncidentByReportCode(reportCode: string) {
  return useQuery({
    queryKey: ['incident-by-code', reportCode],
    queryFn: () => api.get<Incident | null>(`/api/incidents/by-code/${encodeURIComponent(reportCode.toUpperCase())}`),
    enabled: !!reportCode,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIncidentInput) =>
      api.post<Incident>('/api/incidents', {
        type: input.type,
        description: input.description,
        area_landmark: input.area_landmark || null,
        people_affected: input.people_affected,
        people_trapped: input.people_trapped,
        injuries_reported: input.injuries_reported,
        vulnerable_people: input.vulnerable_people,
        danger_increasing: input.danger_increasing,
        latitude: input.latitude,
        longitude: input.longitude,
        reporter_name: input.reporter_name || null,
        reporter_phone: input.reporter_phone || null,
        voice_recording_id: input.voice_recording_id || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useUpdateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Incident> }) =>
      api.patch<Incident>(`/api/incidents/${id}`, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useRecalculatePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string): Promise<RecalculateResult> =>
      api.post<RecalculateResult>(`/api/incidents/${incidentId}/recalculate`, {}),
    onSuccess: (_, incidentId) => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['escalations', incidentId] });
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<RescueTeam[]>('/api/teams'),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      capabilities: string[];
      equipment: string[];
      capacity: number;
      latitude: number;
      longitude: number;
    }) => api.post<RescueTeam>('/api/teams', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<RescueTeam> & { latitude?: number; longitude?: number };
    }) => api.patch<RescueTeam>(`/api/teams/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: () => api.get<Resource[]>('/api/resources'),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      type: string;
      quantity_available: number;
      quantity_reserved: number;
      latitude?: number;
      longitude?: number;
      low_stock_threshold: number;
    }) => api.post<Resource>('/api/resources', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Resource> & { latitude?: number; longitude?: number };
    }) => api.patch<Resource>(`/api/resources/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ['assignments'],
    queryFn: () => api.get<Assignment[]>('/api/assignments'),
  });
}

export function useAssignmentsForIncident(incidentId: string) {
  return useQuery({
    queryKey: ['assignments-incident', incidentId],
    queryFn: () => api.get<Assignment[]>(`/api/assignments?incident_id=${incidentId}`),
    enabled: !!incidentId,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, teamId, resourceIds }: { incidentId: string; teamId: string; resourceIds: string[] }) =>
      api.post<{ id: string }>('/api/assignments', { incidentId, teamId, resourceIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Assignment> }) =>
      api.patch<Assignment>(`/api/assignments/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useCancelAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason: string }) =>
      api.post<{ success: boolean }>(`/api/assignments/${assignmentId}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useTeamRecommendations(incidentId: string) {
  return useQuery({
    queryKey: ['recommendations', incidentId],
    queryFn: () => api.get<TeamRecommendation[]>(`/api/incidents/${incidentId}/recommendations`),
    enabled: !!incidentId,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<Alert[]>('/api/alerts'),
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      api.patch<Alert>(`/api/alerts/${alertId}/acknowledge`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useEscalations(incidentId: string) {
  return useQuery({
    queryKey: ['escalations', incidentId],
    queryFn: () => api.get<Escalation[]>(`/api/incidents/${incidentId}/escalations`),
    enabled: !!incidentId,
  });
}

export function useAuditLogs(entityType?: string, entityId?: string, limit = 20) {
  return useQuery({
    queryKey: ['audit-logs', entityType, entityId, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (entityType) params.set('entity_type', entityType);
      if (entityId) params.set('entity_id', entityId);
      return api.get<AuditLog[]>(`/api/audit-logs?${params.toString()}`);
    },
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary'),
    refetchInterval: 15000,
  });
}
