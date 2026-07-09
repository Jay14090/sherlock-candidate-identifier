import {
  toTranscriptAnalysis,
  type TranscriptRoleClassifier,
  type TranscriptRoleResult,
} from '../transcriptRoleClassifier';
import type { TranscriptAnalysis } from '../types';
import { classifyWithRules } from './ruleBasedTranscriptClassifier';
import { classifyWithSemanticSimilarity } from './semanticTranscriptClassifier';

/**
 * Hybrid transcript role classifier — the demo default.
 *
 * Decision logic:
 * 1. High-precision phrase rules run first. A confident rule hit wins —
 *    "my name is" / "next question" are near-unambiguous.
 * 2. When rules see nothing, the offline semantic classifier handles
 *    paraphrases via example-bank similarity.
 * 3. When both fire and AGREE, confidence gets a small boost.
 * 4. When they CONFLICT, confidence is lowered and both sets of reasons are
 *    kept, so the ambiguity is visible downstream instead of hidden.
 *
 * Fully offline, synchronous, and deterministic — the same transcript always
 * produces the same classifications, which keeps `npm run evaluate` stable.
 */

/** Rule confidence at/above this counts as a strong, decisive phrase hit. */
const STRONG_RULE_SCORE = 0.6;
/** Semantic must be at least this confident to override / conflict with rules. */
const MIN_SEMANTIC_SCORE = 0.45;
const AGREEMENT_BONUS = 0.05;
const CONFLICT_PENALTY = 0.15;

function clamp(value: number, min = 0.05, max = 0.95): number {
  return Math.min(max, Math.max(min, value));
}

/** Blends the detailed likelihoods of both classifiers for the scorer. */
function blendAnalyses(
  rules: TranscriptRoleResult,
  semantic: TranscriptRoleResult,
  ruleWeight: number,
  reasons: string[],
): TranscriptAnalysis {
  const r = rules.analysis ?? toTranscriptAnalysis(rules);
  const s = semantic.analysis ?? toTranscriptAnalysis(semantic);
  const w = ruleWeight;
  return {
    candidateLikelihood: clamp(w * r.candidateLikelihood + (1 - w) * s.candidateLikelihood),
    interviewerLikelihood: clamp(w * r.interviewerLikelihood + (1 - w) * s.interviewerLikelihood),
    matchedCandidatePatterns: r.matchedCandidatePatterns,
    matchedInterviewerPatterns: r.matchedInterviewerPatterns,
    summary: reasons[0] ?? 'Neutral utterance.',
    reasons,
  };
}

/**
 * Classifies one utterance with rules + semantic similarity.
 * Synchronous and fully deterministic.
 */
export function classifyHybrid(text: string): TranscriptRoleResult {
  const rules = classifyWithRules(text);
  const semantic = classifyWithSemanticSimilarity(text);

  const rulesDecisive = rules.role !== 'neutral' && rules.score >= STRONG_RULE_SCORE;
  const semanticDecisive = semantic.role !== 'neutral' && semantic.score >= MIN_SEMANTIC_SCORE;

  let role: TranscriptRoleResult['role'];
  let score: number;
  let method: TranscriptRoleResult['method'];
  let ruleWeight: number;
  const reasons: string[] = [];

  if (rulesDecisive) {
    role = rules.role;
    method = 'rules';
    ruleWeight = 0.7;
    reasons.push(...rules.reasons);
    if (semanticDecisive && semantic.role === role) {
      score = clamp(rules.score + AGREEMENT_BONUS);
      reasons.push(...semantic.reasons.slice(0, 1));
    } else if (semanticDecisive && semantic.role !== role) {
      score = clamp(rules.score - CONFLICT_PENALTY, 0.3);
      reasons.push(
        `Semantic classifier disagrees (${semantic.role}) — confidence reduced.`,
        ...semantic.reasons.slice(0, 1),
      );
    } else {
      score = rules.score;
    }
  } else if (semanticDecisive) {
    role = semantic.role;
    method = 'semantic';
    ruleWeight = 0.3;
    reasons.push(...semantic.reasons);
    if (rules.role === role) {
      // Weak rule evidence pointing the same way still helps a little.
      score = clamp(semantic.score + AGREEMENT_BONUS);
      reasons.push(...rules.reasons.filter((reason) => reason.startsWith('Matched')));
    } else if (rules.role !== 'neutral') {
      score = clamp(semantic.score - CONFLICT_PENALTY, 0.3);
      reasons.push(
        `Rule-based classifier disagrees (${rules.role}) — confidence reduced.`,
        ...rules.reasons.filter((reason) => reason.startsWith('Matched')),
      );
    } else {
      score = semantic.score;
    }
  } else {
    role = 'neutral';
    method = 'semantic';
    ruleWeight = 0.5;
    score = 0.5;
    reasons.push('No high-precision phrases matched and no close semantic example — neutral.');
  }

  return {
    role,
    score,
    reasons,
    method,
    analysis: { ...blendAnalyses(rules, semantic, ruleWeight, reasons), method },
  };
}

export const hybridClassifier: TranscriptRoleClassifier = {
  classifyUtterance: classifyHybrid,
};

/**
 * Convenience for the synchronous replay reducer: classify with the default
 * hybrid classifier and return the `TranscriptAnalysis` shape the scoring
 * engine consumes.
 */
export function analyzeUtterance(text: string): TranscriptAnalysis {
  return toTranscriptAnalysis(classifyHybrid(text));
}
