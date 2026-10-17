import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Incident, RescueTeam, Resource, Assignment, Alert, AuditLog, Escalation, TeamRecommendation, RecalculateResult, IncidentType, TriState } from '@/types';

// ============ INCIDENTS ============

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
      let query = supabase.from('incidents').select('*').order('priority_score', { ascending: false }).order('created_at', { ascending: false });
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
      const { data, error } = await supabase.from('incidents').select('*').eq('report_code', reportCode.toUpperCase()).maybeSingle();
      if (error) throw error;
      return data as Incident | null;
    },
    enabled: !!reportCode,
  });
}

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

export function useCreateIncident() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useUpdateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Incident> }) => {
      const { data, error } = await supabase.from('incidents').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Incident;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incident', vars.id] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useRecalculatePriority() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['escalations', incidentId] });
    },
  });
}

// ============ TEAMS ============

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; capabilities: string[]; equipment: string[]; capacity: number; latitude: number; longitude: number }) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RescueTeam> & { latitude?: number; longitude?: number } }) => {
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
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

// ============ RESOURCES ============

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; type: string; quantity_available: number; quantity_reserved: number; latitude?: number; longitude?: number; low_stock_threshold: number }) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  });
}

export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Resource> & { latitude?: number; longitude?: number } }) => {
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
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

// ============ ASSIGNMENTS ============

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
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Assignment> }) => {
      const { data, error } = await supabase.from('assignments').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Assignment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useCancelAssignment() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

// ============ RECOMMENDATIONS ============

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

// ============ ALERTS ============

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Alert[];
    },
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

// ============ ESCALATIONS ============

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

// ============ AUDIT LOGS ============

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

// ============ DASHBOARD SUMMARY ============

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

      if (incidents.error) throw incidents.error;
      if (teams.error) throw teams.error;
      if (resources.error) throw resources.error;

      const incData = incidents.data as Pick<Incident, 'status' | 'priority_level'>[];
      const teamData = teams.data as Pick<RescueTeam, 'status'>[];
      const resData = resources.data as Pick<Resource, 'quantity_available' | 'quantity_reserved' | 'low_stock_threshold'>[];
      const asgnData = assignments.data as Pick<Assignment, 'status'>[];
      const alertData = alerts.data as Pick<Alert, 'acknowledged'>[];

      const openIncidents = incData.filter((i) => !['resolved', 'cancelled'].includes(i.status)).length;
      const criticalIncidents = incData.filter((i) => i.priority_level === 'critical' && !['resolved', 'cancelled'].includes(i.status)).length;
      const availableTeams = teamData.filter((t) => t.status === 'available').length;
      const resourceShortages = resData.filter((r) => r.quantity_available <= r.low_stock_threshold).length;
      const resolvedIncidents = incData.filter((i) => i.status === 'resolved').length;
      const activeAssignments = asgnData.filter((a) => ['assigned', 'dispatched'].includes(a.status)).length;
      const unacknowledgedAlerts = alertData.filter((a) => !a.acknowledged).length;

      return {
        openIncidents,
        criticalIncidents,
        availableTeams,
        resourceShortages,
        totalIncidents: incData.length,
        resolvedIncidents,
        totalTeams: teamData.length,
        totalResources: resData.length,
        activeAssignments,
        unacknowledgedAlerts,
      };
    },
    refetchInterval: 15000,
  });
}
