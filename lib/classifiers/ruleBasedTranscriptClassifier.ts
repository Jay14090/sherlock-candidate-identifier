import { CANDIDATE_PATTERNS, INTERVIEWER_PATTERNS } from '../constants';
import type {
  TranscriptRole,
  TranscriptRoleClassifier,
  TranscriptRoleResult,
} from '../transcriptRoleClassifier';
import type { TranscriptAnalysis } from '../types';

function clamp(value: number, min = 0.05, max = 0.95): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic, high-precision transcript role classification.
 *
 * Counts first-person candidate-style phrases vs question/instruction
 * interviewer-style phrases. Both likelihoods can be non-zero — people mix
 * roles inside a single utterance — and one matched phrase is never allowed
 * to produce an extreme score on its own.
 */
export function analyzeTranscript(text: string): TranscriptAnalysis {
  const lower = text.toLowerCase();

  const matchedCandidatePatterns = CANDIDATE_PATTERNS.filter((p) => lower.includes(p));
  const matchedInterviewerPatterns = INTERVIEWER_PATTERNS.filter((p) => lower.includes(p));

  const c = matchedCandidatePatterns.length;
  const i = matchedInterviewerPatterns.length;

  let candidateLikelihood: number;
  if (c === 0) {
    candidateLikelihood = i > 0 ? 0.2 : 0.4;
  } else {
    candidateLikelihood = clamp(0.55 + 0.15 * c - 0.1 * i);
  }

  let interviewerLikelihood: number;
  if (i === 0) {
    interviewerLikelihood = c > 0 ? 0.2 : 0.4;
  } else {
    interviewerLikelihood = clamp(0.55 + 0.15 * i - 0.1 * c);
  }

  let summary: string;
  if (c > 0 && i === 0) {
    summary = `Candidate-style utterance (${c} first-person experience phrase${c > 1 ? 's' : ''}).`;
  } else if (i > 0 && c === 0) {
    summary = `Interviewer-style utterance (${i} question/instruction phrase${i > 1 ? 's' : ''}).`;
  } else if (c > 0 && i > 0) {
    summary = 'Mixed utterance with both candidate-style and interviewer-style phrases.';
  } else {
    summary = 'Neutral utterance with no strong role indicators.';
  }

  return {
    candidateLikelihood,
    interviewerLikelihood,
    matchedCandidatePatterns,
    matchedInterviewerPatterns,
    summary,
  };
}

const MAX_PHRASE_REASONS = 4;

/**
 * Classifies one utterance with high-precision phrase rules only.
 * Synchronous and fully deterministic.
 */
export function classifyWithRules(text: string): TranscriptRoleResult {
  const analysis = analyzeTranscript(text);
  const c = analysis.matchedCandidatePatterns.length;
  const i = analysis.matchedInterviewerPatterns.length;

  const reasons: string[] = [
    ...analysis.matchedCandidatePatterns
      .slice(0, MAX_PHRASE_REASONS)
      .map((p) => `Matched candidate phrase "${p}"`),
    ...analysis.matchedInterviewerPatterns
      .slice(0, MAX_PHRASE_REASONS)
      .map((p) => `Matched interviewer phrase "${p}"`),
  ];

  let role: TranscriptRole;
  let score: number;
  if (c > i) {
    role = 'candidate';
    score = analysis.candidateLikelihood;
  } else if (i > c) {
    role = 'interviewer';
    score = analysis.interviewerLikelihood;
  } else if (c > 0) {
    // Equal evidence in both directions — a genuinely mixed utterance.
    role = 'neutral';
    score = 0.35;
    reasons.push('Candidate-style and interviewer-style phrases are balanced — role is ambiguous.');
  } else {
    role = 'neutral';
    score = 0.5;
    reasons.push('No high-precision role phrases matched.');
  }

  const result: TranscriptRoleResult = {
    role,
    score,
    reasons,
    method: 'rules',
    analysis: { ...analysis, method: 'rules', reasons },
  };
  return result;
}

export const ruleBasedClassifier: TranscriptRoleClassifier = {
  classifyUtterance: classifyWithRules,
};
