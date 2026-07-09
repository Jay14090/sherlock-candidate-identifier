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

/**
 * The distinct kinds of evidence the engine can draw on. Used both for
 * scoring and for the evidence-coverage metric (how much useful information
 * is actually available for a participant, independent of how candidate-like
 * they look).
 */
export type SignalCategory =
  | 'identity'
  | 'email'
  | 'transcript'
  | 'speaking'
  | 'interviewerExclusion'
  | 'joinTiming'
  | 'webcam'
  | 'screenShare'
  | 'consistency';

export interface ParticipantScore {
  participantId: ParticipantId;
  displayName: string;
  /** Evidence-based candidate score (smoothed), 0..1. NOT a calibrated probability. */
  score: number;
  rawScore: number; // 0 to 1 (before temporal smoothing)
  scorePercent: number; // 0 to 100
  /** Fraction of signal categories with usable evidence for this participant, 0..1. */
  evidenceCoverage: number;
  activeSignalCategories: SignalCategory[];
  breakdown: SignalBreakdown;
  evidence: EvidenceItem[];
}

export interface CandidateDecision {
  selectedParticipantId: ParticipantId | null;
  status: 'selected' | 'uncertain' | 'insufficient_data';
  /** Candidate score of the top participant. Evidence-based, not a calibrated probability. */
  candidateScore: number;
  /** Evidence coverage of the top participant, 0..1. */
  evidenceCoverage: number;
  marginToRunnerUp: number;
  runnerUpParticipantId: ParticipantId | null;
  explanation: string;
  scores: ParticipantScore[];
}

/**
 * Production output contract — the shape a downstream consumer (Sherlock's
 * fraud detectors) would receive on every update. The demo's
 * CandidateDecision maps 1:1 onto this; meetingId/updatedAtEventId come from
 * the event stream envelope.
 */
export interface CandidateIdentificationResult {
  meetingId: string;
  selectedParticipantId: string | null;
  decision: 'insufficient_data' | 'uncertain' | 'selected';
  candidateScore: number;
  evidenceCoverage: number;
  marginToRunnerUp: number;
  runnerUpParticipantId: string | null;
  evidence: EvidenceItem[];
  updatedAtEventId: string;
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
  /** Which classifier produced this analysis. Absent on legacy/stub analyses. */
  method?: 'rules' | 'semantic' | 'llm';
  /** Human-readable classification reasons (matched phrases, closest examples). */
  reasons?: string[];
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

export interface ScoreHistoryEntry {
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
  scoreHistory: ScoreHistoryEntry[];
}
