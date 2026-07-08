export type ParticipantId = string;

export interface CandidateMetadata {
  candidateName?: string;
  candidateEmail?: string;
  scheduledStartTime: string; // ISO string
  scheduledEndTime?: string;
  interviewerNames: string[];
  interviewerEmails?: string[];
  calendarInviteText?: string;
  jobRole?: string;
}

export interface Participant {
  id: ParticipantId;
  displayName: string;
  email?: string;
  isHost?: boolean;
  initialJoinTime?: string;
}

export type MeetingEventType =
  | 'join'
  | 'leave'
  | 'display_name_change'
  | 'webcam_on'
  | 'webcam_off'
  | 'screen_share_start'
  | 'screen_share_stop'
  | 'speech_activity'
  | 'transcript';

export interface MeetingEvent {
  id: string;
  timestamp: string;
  participantId: ParticipantId;
  type: MeetingEventType;
  payload: Record<string, unknown>;
}

export interface TranscriptPayload {
  text: string;
  durationSeconds?: number;
}

export interface SpeechPayload {
  durationSeconds: number;
}

export type EvidenceDirection = 'positive' | 'negative' | 'neutral';
export type EvidenceStrength = 'weak' | 'medium' | 'strong';

export interface EvidenceItem {
  signal: string;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  message: string;
  weightImpact: number;
}

export interface SignalBreakdown {
  nameMatch: number;
  emailMatch: number;
  interviewerExclusion: number;
  joinTiming: number;
  speakingPattern: number;
  transcriptCandidateLikelihood: number;
  transcriptInterviewerLikelihood: number;
  webcamPresence: number;
  screenShareBehavior: number;
  consistency: number;
}

export interface ParticipantScore {
  participantId: ParticipantId;
  displayName: string;
  score: number; // 0 to 1 (smoothed)
  rawScore: number; // 0 to 1 (before temporal smoothing)
  confidencePercent: number; // 0 to 100
  breakdown: SignalBreakdown;
  evidence: EvidenceItem[];
}

export interface CandidateDecision {
  selectedParticipantId: ParticipantId | null;
  status: 'selected' | 'uncertain' | 'insufficient_data';
  confidence: number;
  marginFromSecond: number;
  explanation: string;
  scores: ParticipantScore[];
}

export interface MeetingScenario {
  id: string;
  name: string;
  description: string;
  expectedCandidateParticipantId: ParticipantId | null;
  metadata: CandidateMetadata;
  participants: Participant[];
  events: MeetingEvent[];
  notes?: string[];
}

export interface TranscriptAnalysis {
  candidateLikelihood: number;
  interviewerLikelihood: number;
  matchedCandidatePatterns: string[];
  matchedInterviewerPatterns: string[];
  summary: string;
}

/** Pluggable seam for a future LLM-backed classifier. The default implementation is local and deterministic. */
export interface TranscriptRoleClassifier {
  classify(text: string): Promise<TranscriptAnalysis>;
}

export interface AnalyzedUtterance {
  text: string;
  durationSeconds: number;
  timestamp: string;
  analysis: TranscriptAnalysis;
}

export interface ParticipantRuntimeState {
  id: ParticipantId;
  currentDisplayName: string;
  email?: string;
  isHost?: boolean;
  joined: boolean;
  joinTime?: string;
  leaveTime?: string;
  webcamOn: boolean | null; // null = no webcam signal observed yet
  screenSharing: boolean;
  hasEverScreenShared: boolean;
  screenShareWhileCandidateLike: boolean;
  totalSpeakingSeconds: number;
  speakingTurnCount: number;
  utterances: AnalyzedUtterance[];
  nameHistory: string[]; // every display name this participant has used, in order
  lastActivityTime?: string;
}

export interface ConfidenceHistoryEntry {
  eventId: string;
  timestamp: string;
  scores: Record<ParticipantId, number>;
  selectedParticipantId: ParticipantId | null;
  status: CandidateDecision['status'];
}

export interface MeetingRuntimeState {
  metadata: CandidateMetadata;
  participants: Record<ParticipantId, ParticipantRuntimeState>;
  participantOrder: ParticipantId[];
  allEvents: MeetingEvent[];
  processedEvents: MeetingEvent[];
  currentEventIndex: number;
  transcriptEventCount: number;
  decision: CandidateDecision;
  previousSmoothedScores: Record<ParticipantId, number>;
  confidenceHistory: ConfidenceHistoryEntry[];
}
