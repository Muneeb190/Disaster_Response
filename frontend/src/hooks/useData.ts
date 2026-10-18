import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  Alert,
  Assignment,
  AssignmentStatus,
  AuditLog,
  Escalation,
  Incident,
  IncidentEvent,
  IncidentType,
  Shelter,
  TeamStatus,
  RecalculateResult,
  RescueTeam,
  Resource,
  TeamRecommendation,
  TriState,
  DuplicateCandidate,
  PriorityLevel,
  DangerZone,
  IncidentEvidence,
  PublicShelterSuggestion,
  RescueCompletionReport,
  CompletionSupplyUsage,
  BackupRequest,
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
  ai_extracted?: Record<string, unknown> | null;
  followup_question?: string | null;
  followup_field?: string | null;
  followup_answer?: TriState | null;
  followup_skipped?: boolean;
  voice_recording_id?: string | null;
  input_mode?: 'text' | 'voice';
  voice_transcript?: string | null;
  transcript_language?: import('@/types').TranscriptLanguage | null;
  transcript_english?: string | null;
}

export interface CreateIncidentResult {
  id: string;
  report_code: string;
  tracking_token: string;
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
  reportedLastHour: number;
}

export function useIncidents(filters?: {
  type?: IncidentType;
  priority?: string;
  status?: string;
  verification?: string;
  limit?: number;
  includeLinked?: boolean;
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
      if (!filters?.includeLinked) query = query.is('primary_incident_id', null);
      if (filters?.limit) query = query.limit(filters.limit);
      const { data, error } = await query;
      if (error) throw error;
      return data as Incident[];
    },
  });
}

export function useDuplicateCandidates(incidentId: string) {
  return useQuery({
    queryKey: ['duplicate-candidates', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_duplicate_candidates', { p_incident_id: incidentId });
      if (error) throw error;
      return data as unknown as DuplicateCandidate[];
    },
    enabled: !!incidentId,
  });
}

export function useDangerZones() {
  return useQuery({
    queryKey: ['danger-zones'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_active_danger_zones');
      if (error) throw error;
      return data as unknown as DangerZone[];
    },
  });
}

export function useLinkedReports(primaryIncidentId: string) {
  return useQuery({
    queryKey: ['linked-reports', primaryIncidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('primary_incident_id', primaryIncidentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Incident[];
    },
    enabled: !!primaryIncidentId,
  });
}

export function useLinkDuplicateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceIncidentId, primaryIncidentId }: { sourceIncidentId: string; primaryIncidentId: string }) => {
      const { error } = await supabase.rpc('link_duplicate_report', {
        p_source_incident_id: sourceIncidentId,
        p_primary_incident_id: primaryIncidentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['linked-reports'] });
    },
  });
}

export function useUnlinkDuplicateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceIncidentId: string) => {
      const { error } = await supabase.rpc('unlink_duplicate_report', { p_source_incident_id: sourceIncidentId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['linked-reports'] });
    },
  });
}

export function useDismissDuplicateSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, candidateId, reason }: { incidentId: string; candidateId: string; reason: string }) => {
      const { error } = await supabase.rpc('dismiss_duplicate_suggestion', {
        p_incident_id: incidentId,
        p_candidate_id: candidateId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
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

export function useIncidentByReportCode(reportCode: string, trackingToken = '') {
  return useQuery({
    queryKey: ['incident-by-code', reportCode, trackingToken],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_incident_status', {
        p_report_code: reportCode.toUpperCase(),
        p_tracking_token: trackingToken || null,
      });
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
      const { data, error } = await supabase.rpc('submit_public_incident', {
        p_type: input.type,
        p_description: input.description,
        p_area_landmark: input.area_landmark || null,
        p_people_affected: input.people_affected,
        p_people_trapped: input.people_trapped,
        p_injuries_reported: input.injuries_reported,
        p_vulnerable_people: input.vulnerable_people,
        p_danger_increasing: input.danger_increasing,
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_reporter_name: input.reporter_name || null,
        p_reporter_phone: input.reporter_phone || null,
        p_ai_extracted: input.ai_extracted ?? null,
        p_followup_question: input.followup_question ?? null,
        p_followup_field: input.followup_field ?? null,
        p_followup_answer: input.followup_answer ?? null,
        p_followup_skipped: input.followup_skipped ?? false,
        p_voice_recording_id: input.voice_recording_id || null,
        p_input_mode: input.input_mode ?? 'text',
        p_voice_transcript: input.voice_transcript ?? null,
        p_transcript_language: input.transcript_language ?? null,
        p_transcript_english: input.transcript_english ?? null,
      });
      if (error) throw error;
      return data as CreateIncidentResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

// Every admin change goes through admin_update_incident: it validates, requires a reason
// for status/verification/fact changes, recalculates priority and writes the audit log.
export function useUpdateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates, reason }: { id: string; updates: Partial<Incident>; reason?: string }) => {
      const { data, error } = await supabase.rpc('admin_update_incident', {
        p_incident_id: id,
        p_changes: updates,
        p_reason: reason || null,
      });
      if (error) throw error;
      return data as Incident;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incident-events', id] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignments-incident', id] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['escalations', id] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
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
      // The RPC returns a one-row table.
      return (Array.isArray(data) ? data[0] : data) as RecalculateResult;
    },
    onSuccess: (_, incidentId) => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['escalations', incidentId] });
    },
  });
}

export function useAppendIncidentDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportCode, trackingToken, details }: { reportCode: string; trackingToken: string; details: string }) => {
      const { error } = await supabase.rpc('append_public_incident_details', {
        p_report_code: reportCode,
        p_tracking_token: trackingToken || null,
        p_details: details,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incident-by-code'] }),
  });
}

export function useOverrideIncidentPriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, level, reason }: { incidentId: string; level: PriorityLevel | null; reason: string }) => {
      const { data, error } = await supabase.rpc('admin_override_incident_priority', {
        p_incident_id: incidentId,
        p_level: level,
        p_reason: reason,
      });
      if (error) throw error;
      return data as Incident;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-events', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
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

// Busy/travelling are driven by assignments; the database rejects setting them by hand.
export function useSetTeamStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: TeamStatus; reason?: string }) => {
      const { data, error } = await supabase.rpc('admin_set_team_status', { p_team_id: id, p_status: status, p_reason: reason || null });
      if (error) throw error;
      return data as RescueTeam;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
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

// Stock changes need a reason; the database keeps quantities at or above zero.
export function useAdjustResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, delta, reason }: { id: string; delta: number; reason: string }) => {
      const { data, error } = await supabase.rpc('admin_adjust_resource', { p_resource_id: id, p_delta: delta, p_reason: reason });
      if (error) throw error;
      return data as Resource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useShelters() {
  return useQuery({
    queryKey: ['shelters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shelters').select('*').order('name');
      if (error) throw error;
      return data as Shelter[];
    },
  });
}

type ShelterInput = Partial<Pick<Shelter, 'name' | 'address' | 'capacity' | 'status' | 'wheelchair_access' | 'medical_support' | 'family_area' | 'has_power' | 'notes'>> & {
  latitude?: number;
  longitude?: number;
};

function shelterPayload({ latitude, longitude, ...rest }: ShelterInput) {
  const payload: Record<string, unknown> = { ...rest };
  if (latitude !== undefined && longitude !== undefined) payload.location = `POINT(${longitude} ${latitude})`;
  return payload;
}

export function useSaveShelter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ShelterInput }) => {
      const query = id
        ? supabase.from('shelters').update(shelterPayload(input)).eq('id', id)
        : supabase.from('shelters').insert(shelterPayload(input));
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as Shelter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelters'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useAdjustShelterOccupancy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, delta, reason }: { id: string; delta: number; reason?: string }) => {
      const { data, error } = await supabase.rpc('admin_adjust_shelter_occupancy', { p_shelter_id: id, p_delta: delta, p_reason: reason || null });
      if (error) throw error;
      return data as Shelter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shelters'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
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

export interface ResponderLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

function responderLocationParams(location: ResponderLocation | null) {
  return {
    p_latitude: location?.latitude ?? null,
    p_longitude: location?.longitude ?? null,
    p_accuracy_m: location?.accuracy ?? null,
  };
}

function invalidateFieldWorkflow(queryClient: ReturnType<typeof useQueryClient>, incidentId?: string) {
  queryClient.invalidateQueries({ queryKey: ['assignments'] });
  queryClient.invalidateQueries({ queryKey: ['incidents'] });
  queryClient.invalidateQueries({ queryKey: ['teams'] });
  queryClient.invalidateQueries({ queryKey: ['resources'] });
  queryClient.invalidateQueries({ queryKey: ['alerts'] });
  queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  if (incidentId) {
    queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
    queryClient.invalidateQueries({ queryKey: ['assignments-incident', incidentId] });
    queryClient.invalidateQueries({ queryKey: ['incident-events', incidentId] });
  }
}

export function useResponderAssignmentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignmentId,
      action,
      reason,
      location,
    }: {
      assignmentId: string;
      action: 'accept' | 'arrived' | 'victim_reached' | 'needs_backup';
      reason?: string;
      location: ResponderLocation | null;
    }) => {
      const { data, error } = await supabase.rpc('responder_assignment_action', {
        p_assignment_id: assignmentId,
        p_action: action,
        p_reason: reason || null,
        ...responderLocationParams(location),
      });
      if (error) throw error;
      return data as Assignment;
    },
    onSuccess: (assignment) => invalidateFieldWorkflow(queryClient, assignment.incident_id),
  });
}

export function useResponderRejectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, reason }: { assignmentId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('responder_reject_assignment', {
        p_assignment_id: assignmentId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as Assignment;
    },
    onSuccess: (assignment) => invalidateFieldWorkflow(queryClient, assignment.incident_id),
  });
}

export function useResponderCompleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignmentId,
      peopleReached,
      suppliesUsed,
      furtherHelpNeeded,
      furtherHelpDetails,
      notes,
      location,
    }: {
      assignmentId: string;
      peopleReached: number;
      suppliesUsed: CompletionSupplyUsage[];
      furtherHelpNeeded: boolean;
      furtherHelpDetails?: string;
      notes?: string;
      location: ResponderLocation | null;
    }) => {
      const { data, error } = await supabase.rpc('responder_complete_assignment', {
        p_assignment_id: assignmentId,
        p_people_reached: peopleReached,
        p_supplies_used: suppliesUsed,
        p_further_help_needed: furtherHelpNeeded,
        p_further_help_details: furtherHelpDetails || null,
        p_notes: notes || null,
        ...responderLocationParams(location),
      });
      if (error) throw error;
      return data as RescueCompletionReport;
    },
    onSuccess: (report) => invalidateFieldWorkflow(queryClient, report.incident_id),
  });
}

export function useIncidentEvidence(incidentId: string) {
  return useQuery({
    queryKey: ['incident-evidence', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('incident_evidence').select('*')
        .eq('incident_id', incidentId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as IncidentEvidence[];
    },
    enabled: !!incidentId,
  });
}

export function useBackupRequestsForIncident(incidentId: string) {
  return useQuery({
    queryKey: ['backup-requests', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('backup_requests').select('*')
        .eq('incident_id', incidentId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as BackupRequest[];
    },
    enabled: !!incidentId,
  });
}

export function useCompletionReportsForIncident(incidentId: string) {
  return useQuery({
    queryKey: ['completion-reports', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('rescue_completion_reports').select('*')
        .eq('incident_id', incidentId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as RescueCompletionReport[];
    },
    enabled: !!incidentId,
  });
}

export function useReviewIncidentEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ evidenceId, status, notes }: { evidenceId: string; status: 'verified' | 'disputed'; notes?: string }) => {
      const { data, error } = await supabase.rpc('admin_review_incident_evidence', {
        p_evidence_id: evidenceId,
        p_status: status,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data as IncidentEvidence;
    },
    onSuccess: (evidence) => {
      queryClient.invalidateQueries({ queryKey: ['incident-evidence', evidence.incident_id] });
      queryClient.invalidateQueries({ queryKey: ['incident-events', evidence.incident_id] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function usePublicShelterSuggestions(reportCode: string, trackingToken: string, needs: string[]) {
  return useQuery({
    queryKey: ['public-shelter-suggestions', reportCode, trackingToken, needs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_shelter_suggestions', {
        p_report_code: reportCode,
        p_tracking_token: trackingToken || null,
        p_needs: needs,
      });
      if (error) throw error;
      return data as PublicShelterSuggestion[];
    },
    enabled: Boolean(reportCode),
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

// Dispatch marks the team travelling; completion frees the team and its reserved resources.
export function useSetAssignmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: AssignmentStatus; reason?: string }) => {
      const { data, error } = await supabase.rpc('admin_set_assignment_status', { p_assignment_id: id, p_status: status, p_reason: reason || null });
      if (error) throw error;
      return data as Assignment;
    },
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignments-incident', assignment.incident_id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident', assignment.incident_id] });
      queryClient.invalidateQueries({ queryKey: ['incident-events', assignment.incident_id] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
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

export function useAlerts(limit = 50) {
  return useQuery({
    queryKey: ['alerts', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*, incidents(report_code), profiles(full_name,email)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Alert[];
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.rpc('acknowledge_alert', { p_alert_id: alertId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useIncidentEvents(incidentId: string) {
  return useQuery({
    queryKey: ['incident-events', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incident_events')
        .select('*, profiles(full_name,email)')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as IncidentEvent[];
    },
    enabled: !!incidentId,
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

export function useAuditLogs(entityType?: string, entityId?: string, limit = 20, filters?: { action?: string; actorId?: string; sinceHours?: number }) {
  return useQuery({
    queryKey: ['audit-logs', entityType, entityId, limit, filters],
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(limit);
      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);
      if (filters?.action) query = query.eq('action', filters.action);
      if (filters?.actorId) query = query.eq('actor_user_id', filters.actorId);
      if (filters?.sinceHours) query = query.gte('created_at', new Date(Date.now() - filters.sinceHours * 3_600_000).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });
}

export interface SituationSummary {
  generated_at: string;
  period_hours: number;
  contains_demo_data: boolean;
  incidents: { open: number; critical_open: number; unassigned_open: number; unverified_open: number; urgent_check_open: number; reported_in_period: number; resolved_in_period: number };
  urgent: Pick<Incident, 'report_code' | 'type' | 'area_landmark' | 'priority_level' | 'priority_score' | 'status' | 'verification_status' | 'life_threatening' | 'confidence_level' | 'needs_urgent_check' | 'created_at'>[];
  teams: Partial<Record<TeamStatus, number>>;
  active_assignments: number;
  shortages: { name: string; type: string; available: number; threshold: number }[];
  shelters: { open: number; full: number; capacity: number; occupancy: number; stale: number };
  alerts_unacknowledged: number;
  recent_changes: { report_code: string; event_type: string; from_value: string | null; to_value: string | null; reason: string | null; created_at: string }[];
}

export function useSituationSummary(hours: number) {
  return useQuery({
    queryKey: ['situation-summary', hours],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('situation_summary', { p_hours: hours });
      if (error) throw error;
      return data as SituationSummary;
    },
  });
}

export function useSituationReports() {
  return useQuery({
    queryKey: ['situation-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('situation_reports')
        .select('id, period_hours, notes, created_at, profiles(full_name,email)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as { id: string; period_hours: number; notes: string | null; created_at: string; profiles: { full_name: string; email: string } | null }[];
    },
  });
}

export function useSaveSituationReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ hours, notes }: { hours: number; notes: string }) => {
      const { data, error } = await supabase.rpc('save_situation_report', { p_hours: hours, p_notes: notes });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['situation-reports'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// True when any seeded/simulated rows exist, so screens can show the DEMO SCENARIO label.
export function useDemoPresence() {
  return useQuery({
    queryKey: ['demo-presence'],
    queryFn: async () => {
      const tables = ['incidents', 'rescue_teams', 'resources', 'shelters'] as const;
      const results = await Promise.all(tables.map((table) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_demo', true)));
      return results.some((result) => (result.count ?? 0) > 0);
    },
    staleTime: 60_000,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const [incidents, teams, resources, assignments, alerts] = await Promise.all([
        supabase.from('incidents').select('status, priority_level, created_at'),
        supabase.from('rescue_teams').select('status'),
        supabase.from('resources').select('quantity_available, quantity_reserved, low_stock_threshold'),
        supabase.from('assignments').select('status'),
        supabase.from('alerts').select('acknowledged'),
      ]);

      for (const result of [incidents, teams, resources, assignments, alerts]) {
        if (result.error) throw result.error;
      }

      const incidentData = incidents.data as Pick<Incident, 'status' | 'priority_level' | 'created_at'>[];
      const hourAgo = Date.now() - 3_600_000;
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
        reportedLastHour: incidentData.filter((item) => new Date(item.created_at).getTime() >= hourAgo).length,
      };
    },
    refetchInterval: 15000,
  });
}
