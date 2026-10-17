import type { IncidentType, TriState } from '@/types';

export type FollowupField = 'people_trapped' | 'injuries_reported' | 'vulnerable_people' | 'danger_increasing';

export interface FollowupQuestion {
  field: FollowupField;
  question: string;
}

// Most critical missing fact first, per emergency type. At most one question is ever asked.
const QUESTIONS: Record<IncidentType, FollowupQuestion[]> = {
  flood: [
    { field: 'people_trapped', question: 'Is anyone trapped or unable to leave?' },
    { field: 'danger_increasing', question: 'Is the water still rising?' },
    { field: 'vulnerable_people', question: 'Are children, elderly or disabled people there?' },
    { field: 'injuries_reported', question: 'Is anyone injured?' },
  ],
  fire: [
    { field: 'people_trapped', question: 'Is anyone still inside?' },
    { field: 'danger_increasing', question: 'Is the fire spreading?' },
    { field: 'injuries_reported', question: 'Is anyone injured or burned?' },
  ],
  medical_emergency: [
    { field: 'injuries_reported', question: 'Is the person unconscious, not breathing, or bleeding heavily?' },
    { field: 'danger_increasing', question: 'Is their condition getting worse?' },
  ],
  heatwave: [
    { field: 'injuries_reported', question: 'Is anyone unconscious, confused or vomiting?' },
    { field: 'vulnerable_people', question: 'Are elderly people or young children affected?' },
  ],
  other: [
    { field: 'injuries_reported', question: 'Is anyone injured?' },
    { field: 'people_trapped', question: 'Is anyone trapped?' },
  ],
};

export function pickFollowupQuestion(type: IncidentType, answers: Record<FollowupField, TriState>): FollowupQuestion | null {
  return QUESTIONS[type].find((q) => answers[q.field] === 'unknown') ?? null;
}
