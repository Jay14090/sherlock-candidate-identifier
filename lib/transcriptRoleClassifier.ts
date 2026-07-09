import type { TranscriptAnalysis } from './types';

/**
 * Pluggable transcript role-classification layer.
 *
 * The scoring engine never cares *how* an utterance was classified — only
 * that it receives a role, a confidence, and human-readable reasons. This
 * interface is the seam: the offline demo plugs in a hybrid
 * (rules + semantic-similarity) classifier, production can plug in an LLM,
 * an embedding model, or a classifier trained on labeled meeting data
 * without touching the scorer.
 *
 * Implementations live in `lib/classifiers/`:
 * - `ruleBasedTranscriptClassifier.ts` — high-precision phrase matching
 * - `semanticTranscriptClassifier.ts`  — offline bag-of-words similarity
 *   against candidate/interviewer/neutral example utterances
 * - `hybridTranscriptClassifier.ts`    — rules first, semantic for
 *   paraphrases (the demo default)
 * - `llmTranscriptClassifier.ts`       — opt-in Claude-backed classifier
 * - `llmTranscriptClassifier.example.ts` — production LLM extension sketch
 */

export type TranscriptRole = 'candidate' | 'interviewer' | 'neutral';

export type ClassifierMethod = 'rules' | 'semantic' | 'llm';

export type TranscriptRoleResult = {
  role: TranscriptRole;
  /** Confidence in `role`, 0..1. Evidence-based, not a calibrated probability. */
  score: number;
  reasons: string[];
  method: ClassifierMethod;
  /**
   * Optional detail retained for the multi-signal scorer: independent
   * candidate/interviewer likelihoods (both can be non-zero — people mix
   * roles inside one utterance) plus any matched phrases. Classifiers that
   * can produce it should; consumers must not require it.
   */
  analysis?: TranscriptAnalysis;
};

export interface TranscriptRoleClassifier {
  classifyUtterance(text: string): Promise<TranscriptRoleResult> | TranscriptRoleResult;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Bridges a role result into the `TranscriptAnalysis` shape the scoring
 * engine consumes. Uses the classifier's detailed likelihoods when provided;
 * otherwise derives conservative likelihoods from the role + confidence so
 * that even a minimal classifier implementation plugs in safely.
 */
export function toTranscriptAnalysis(result: TranscriptRoleResult): TranscriptAnalysis {
  if (result.analysis) {
    return { ...result.analysis, method: result.method, reasons: result.reasons };
  }

  let candidateLikelihood: number;
  let interviewerLikelihood: number;
  if (result.role === 'candidate') {
    candidateLikelihood = clamp01(Math.max(0.55, result.score));
    interviewerLikelihood = 0.2;
  } else if (result.role === 'interviewer') {
    candidateLikelihood = 0.2;
    interviewerLikelihood = clamp01(Math.max(0.55, result.score));
  } else {
    candidateLikelihood = 0.4;
    interviewerLikelihood = 0.4;
  }

  return {
    candidateLikelihood,
    interviewerLikelihood,
    matchedCandidatePatterns: [],
    matchedInterviewerPatterns: [],
    summary: result.reasons[0] ?? `Classified as ${result.role} (${result.method}).`,
    method: result.method,
    reasons: result.reasons,
  };
}
