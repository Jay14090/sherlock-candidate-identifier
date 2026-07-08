import { NEUTRAL_SCORE } from './constants';
import type { EvidenceDirection, EvidenceItem, EvidenceStrength } from './types';

/**
 * Builds an evidence item from a signal score. Direction and strength are
 * derived from how far the score sits from the neutral baseline, and
 * weightImpact is the contribution to the final score relative to neutral —
 * so a "+0.09" evidence item literally moved the participant 9 points versus
 * a participant with no information on that signal.
 */
export function makeEvidence(
  signal: string,
  score: number,
  weight: number,
  message: string,
): EvidenceItem {
  const delta = score - NEUTRAL_SCORE;
  let direction: EvidenceDirection = 'neutral';
  if (delta > 0.08) direction = 'positive';
  else if (delta < -0.08) direction = 'negative';

  const magnitude = Math.abs(delta);
  let strength: EvidenceStrength = 'weak';
  if (magnitude >= 0.4) strength = 'strong';
  else if (magnitude >= 0.2) strength = 'medium';

  return {
    signal,
    direction,
    strength,
    message,
    weightImpact: round4(delta * weight),
  };
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function sortEvidence(evidence: EvidenceItem[]): EvidenceItem[] {
  return [...evidence].sort((a, b) => Math.abs(b.weightImpact) - Math.abs(a.weightImpact));
}
