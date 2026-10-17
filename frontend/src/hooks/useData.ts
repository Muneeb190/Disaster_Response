import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
      let query = supabase
        .from('incidents')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false });
      if (filters?.type) query = query.eq('type', filters.type);
      if (filters?.priority) query = query.eq('priority_level', filters.priority);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.verification) query = query.eq('verification_status', filters.verification);
      if (filters?.limit) query = query.limit(filters.limit);
      const { data, error } = await query;
      if (error) throw error;
      return data as Incident[];
    },
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('incidents').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Incident | null;
    },
    enabled: !!id,
  });
}

export function useIncidentByReportCode(reportCode: string) {
  return useQuery({
    queryKey: ['incident-by-code', reportCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('report_code', reportCode.toUpperCase())
        .maybeSingle();
      if (error) throw error;
      return data as Incident | null;
    },
    enabled: !!reportCode,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIncidentInput) => {
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          type: input.type,
          description: input.description,
          area_landmark: input.area_landmark || null,
          people_affected: input.people_affected,
          people_trapped: input.people_trapped,
          injuries_reported: input.injuries_reported,
          vulnerable_people: input.vulnerable_people,
          danger_increasing: input.danger_increasing,
          location: `POINT(${input.longitude} ${input.latitude})`,
          reporter_name: input.reporter_name || null,
          reporter_phone: input.reporter_phone || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Incident;
    },
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
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Incident> }) => {
      const { data, error } = await supabase.from('incidents').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Incident;
    },
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
    mutationFn: async (incidentId: string): Promise<RecalculateResult> => {
      const { data, error } = await supabase.rpc('recalculate_incident_priority', {
        p_incident_id: incidentId,
        p_actor: 'coordinator',
      });
      if (error) throw error;
      return data as unknown as RecalculateResult;
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.from('rescue_teams').select('*').order('name');
      if (error) throw error;
      return data as RescueTeam[];
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      capabilities: string[];
      equipment: string[];
      capacity: number;
      latitude: number;
      longitude: number;
    }) => {
      const { data, error } = await supabase
        .from('rescue_teams')
        .insert({
          name: input.name,
          capabilities: input.capabilities,
          equipment: input.equipment,
          capacity: input.capacity,
          location: `POINT(${input.longitude} ${input.latitude})`,
        })
        .select()
        .single();
      if (error) throw error;
      return data as RescueTeam;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<RescueTeam> & { latitude?: number; longitude?: number };
    }) => {
      const { latitude, longitude, ...rest } = updates;
      const payload: Record<string, unknown> = { ...rest };
      if (latitude !== undefined && longitude !== undefined) {
        payload.location = `POINT(${longitude} ${latitude})`;
        payload.last_location_update = new Date().toISOString();
      }
      const { data, error } = await supabase.from('rescue_teams').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data as RescueTeam;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resources').select('*').order('name');
      if (error) throw error;
      return data as Resource[];
    },
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: string;
      quantity_available: number;
      quantity_reserved: number;
      latitude?: number;
      longitude?: number;
      low_stock_threshold: number;
    }) => {
      const payload: Record<string, unknown> = {
        name: input.name,
        type: input.type,
        quantity_available: input.quantity_available,
        quantity_reserved: input.quantity_reserved,
        low_stock_threshold: input.low_stock_threshold,
      };
      if (input.latitude !== undefined && input.longitude !== undefined) {
        payload.location = `POINT(${input.longitude} ${input.latitude})`;
      }
      const { data, error } = await supabase.from('resources').insert(payload).select().single();
      if (error) throw error;
      return data as Resource;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Resource> & { latitude?: number; longitude?: number };
    }) => {
      const { latitude, longitude, ...rest } = updates;
      const payload: Record<string, unknown> = { ...rest };
      if (latitude !== undefined && longitude !== undefined) {
        payload.location = `POINT(${longitude} ${latitude})`;
      }
      const { data, error } = await supabase.from('resources').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data as Resource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ['assignments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('assignments').select('*').order('assigned_at', { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
  });
}

export function useAssignmentsForIncident(incidentId: string) {
  return useQuery({
    queryKey: ['assignments-incident', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('incident_id', incidentId)
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
    enabled: !!incidentId,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, teamId, resourceIds }: { incidentId: string; teamId: string; resourceIds: string[] }) => {
      const { data, error } = await supabase.rpc('create_assignment', {
        p_incident_id: incidentId,
        p_team_id: teamId,
        p_resource_ids: resourceIds,
        p_actor: 'coordinator',
      });
      if (error) throw error;
      return data as string;
    },
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
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Assignment> }) => {
      const { data, error } = await supabase.from('assignments').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Assignment;
    },
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
    mutationFn: async ({ assignmentId, reason }: { assignmentId: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_assignment', {
        p_assignment_id: assignmentId,
        p_reason: reason,
        p_actor: 'coordinator',
      });
      if (error) throw error;
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recommend_teams', { p_incident_id: incidentId });
      if (error) throw error;
      return data as unknown as TeamRecommendation[];
    },
    enabled: !!incidentId,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as Alert[];
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useEscalations(incidentId: string) {
  return useQuery({
    queryKey: ['escalations', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escalations')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Escalation[];
    },
    enabled: !!incidentId,
  });
}

export function useAuditLogs(entityType?: string, entityId?: string, limit = 20) {
  return useQuery({
    queryKey: ['audit-logs', entityType, entityId, limit],
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);
      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const [incidents, teams, resources, assignments, alerts] = await Promise.all([
        supabase.from('incidents').select('status, priority_level'),
        supabase.from('rescue_teams').select('status'),
        supabase.from('resources').select('quantity_available, quantity_reserved, low_stock_threshold'),
        supabase.from('assignments').select('status'),
        supabase.from('alerts').select('acknowledged'),
      ]);

      for (const result of [incidents, teams, resources, assignments, alerts]) {
        if (result.error) throw result.error;
      }

      const incidentData = incidents.data as Pick<Incident, 'status' | 'priority_level'>[];
      const teamData = teams.data as Pick<RescueTeam, 'status'>[];
      const resourceData = resources.data as Pick<Resource, 'quantity_available' | 'quantity_reserved' | 'low_stock_threshold'>[];
      const assignmentData = assignments.data as Pick<Assignment, 'status'>[];
      const alertData = alerts.data as Pick<Alert, 'acknowledged'>[];

      return {
        openIncidents: incidentData.filter((item) => !['resolved', 'cancelled'].includes(item.status)).length,
        criticalIncidents: incidentData.filter(
          (item) => item.priority_level === 'critical' && !['resolved', 'cancelled'].includes(item.status),
        ).length,
        availableTeams: teamData.filter((item) => item.status === 'available').length,
        resourceShortages: resourceData.filter((item) => item.quantity_available <= item.low_stock_threshold).length,
        totalIncidents: incidentData.length,
        resolvedIncidents: incidentData.filter((item) => item.status === 'resolved').length,
        totalTeams: teamData.length,
        totalResources: resourceData.length,
        activeAssignments: assignmentData.filter((item) => ['assigned', 'dispatched'].includes(item.status)).length,
        unacknowledgedAlerts: alertData.filter((item) => !item.acknowledged).length,
      };
    },
    refetchInterval: 15000,
  });
}
