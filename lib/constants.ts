import type { SignalBreakdown } from './types';

/**
 * Weights for the multi-signal scoring engine. They sum to 1.0 so the
 * weighted sum is already normalized to the 0..1 range.
 *
 * Rationale:
 * - Identity signals (name/email) matter but must never dominate alone,
 *   because candidates hide behind device names and nicknames.
 * - Transcript role behavior gets the joint-highest weight because it is the
 *   signal that survives a missing or wrong display name.
 * - Interviewer exclusion is weighted high enough to stop a talkative
 *   interviewer from winning on speaking signals.
 * - Webcam / screen share / consistency are weak auxiliary signals.
 */
export const SIGNAL_WEIGHTS: Record<keyof Omit<SignalBreakdown, 'transcriptInterviewerLikelihood'>, number> = {
  nameMatch: 0.18,
  emailMatch: 0.14,
  interviewerExclusion: 0.16,
  joinTiming: 0.1,
  speakingPattern: 0.14,
  transcriptCandidateLikelihood: 0.18,
  webcamPresence: 0.05,
  screenShareBehavior: 0.03,
  consistency: 0.02,
};

/** A participant is only selected when its smoothed score clears this bar... */
export const SELECTION_THRESHOLD = 0.68;
/** ...AND it leads the runner-up by at least this margin. */
export const MARGIN_THRESHOLD = 0.12;

/**
 * Neutral score used when a signal has no evidence either way.
 * Missing information must not be treated as zero — see docs/assumptions.md.
 */
export const NEUTRAL_SCORE = 0.4;

/** Exponential smoothing: new = prev * SMOOTHING_PREVIOUS + raw * SMOOTHING_CURRENT. */
export const SMOOTHING_PREVIOUS = 0.65;
export const SMOOTHING_CURRENT = 0.35;

/** Display-name tokens that indicate a device or placeholder name rather than a person. */
export const DEVICE_NAME_WORDS = [
  'macbook',
  'iphone',
  'ipad',
  'android',
  'desktop',
  'laptop',
  'pc',
  'user',
  'guest',
  'pro',
  'air',
  'galaxy',
  'pixel',
  'windows',
  'phone',
  'tablet',
  'observer',
  'unknown',
];

/** First-person, experience-sharing phrases typical of a candidate answering questions. */
export const CANDIDATE_PATTERNS = [
  'my name is',
  'i am currently',
  'i worked on',
  'my project',
  'i built',
  'i interned',
  'my experience',
  'i used react',
  'i used',
  'i solved',
  'i would approach',
  'during my internship',
  'my resume',
  'i am pursuing',
  'i graduated',
  'my final year',
  'i have experience',
  'i am a',
  'i implemented',
  'i designed',
  'my role was',
  'i learned',
];

/** Question/instruction phrases typical of an interviewer running the meeting. */
export const INTERVIEWER_PATTERNS = [
  'can you introduce yourself',
  'tell me about',
  'tell us about',
  'what is your experience',
  'can you explain',
  'why should we hire',
  "let's start",
  'lets start',
  'next question',
  'could you walk me through',
  'could you walk us through',
  'how would you solve',
  'do you have any questions for us',
  'walk us through',
  'thanks for joining',
  'we will now',
  'our team',
  'the role involves',
  'can you share your screen',
];

/**
 * Free/public email providers. A shared domain on one of these carries no
 * identity information (two random gmail.com users are unrelated), so
 * same-domain matching is neutral for them — only organization-specific
 * domains give weak same-domain support.
 */
export const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'live.com',
  'msn.com',
];

/** Speaking-pattern thresholds. */
export const CANDIDATE_TURN_LIKELIHOOD = 0.55;
export const INTERVIEWER_TURN_LIKELIHOOD = 0.55;
/** After this many transcript events meeting-wide, silence becomes a mild negative signal. */
export const SILENCE_EVENT_THRESHOLD = 5;
