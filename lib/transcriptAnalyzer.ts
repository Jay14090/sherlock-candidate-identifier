import { CANDIDATE_PATTERNS, INTERVIEWER_PATTERNS } from './constants';
import type { TranscriptAnalysis, TranscriptRoleClassifier } from './types';

function clamp(value: number, min = 0.05, max = 0.95): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic transcript role classification.
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

/**
 * Default local classifier wrapped in the async interface, so an LLM-backed
 * implementation can be swapped in later without touching the scorer.
 */
export const deterministicClassifier: TranscriptRoleClassifier = {
  classify: async (text: string) => analyzeTranscript(text),
};
