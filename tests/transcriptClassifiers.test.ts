import { describe, expect, it } from 'vitest';
import {
  analyzeTranscript,
  classifyWithRules,
} from '@/lib/classifiers/ruleBasedTranscriptClassifier';
import { classifyWithSemanticSimilarity } from '@/lib/classifiers/semanticTranscriptClassifier';
import { analyzeUtterance, classifyHybrid } from '@/lib/classifiers/hybridTranscriptClassifier';
import { toTranscriptAnalysis } from '@/lib/transcriptRoleClassifier';

/* ------------------------------------------------------------------ */
/* Rule-based classifier                                               */
/* ------------------------------------------------------------------ */

describe('rule-based classifier', () => {
  it('classifies a candidate introduction as candidate-like', () => {
    const result = analyzeTranscript(
      'Hi, my name is Ananya. I am currently in my final year and I built a fraud detection dashboard.',
    );
    expect(result.candidateLikelihood).toBeGreaterThan(0.55);
    expect(result.interviewerLikelihood).toBeLessThan(0.45);
    expect(result.matchedCandidatePatterns).toContain('my name is');
    expect(result.matchedCandidatePatterns).toContain('i built');
  });

  it('classifies interviewer questions as interviewer-like', () => {
    const result = analyzeTranscript(
      'Can you introduce yourself and tell me about your experience? Next question after that.',
    );
    expect(result.interviewerLikelihood).toBeGreaterThan(0.55);
    expect(result.candidateLikelihood).toBeLessThan(0.45);
    expect(result.matchedInterviewerPatterns).toContain('can you introduce yourself');
  });

  it('keeps neutral text neutral', () => {
    const result = analyzeTranscript('The weather is nice today.');
    expect(result.candidateLikelihood).toBe(0.4);
    expect(result.interviewerLikelihood).toBe(0.4);
  });

  it('does not become overconfident from a single phrase', () => {
    const result = analyzeTranscript('I built it.');
    expect(result.candidateLikelihood).toBeLessThanOrEqual(0.75);
  });

  it('handles mixed utterances with both roles present', () => {
    const result = analyzeTranscript(
      'I worked on similar systems myself — but tell me about your approach.',
    );
    expect(result.matchedCandidatePatterns.length).toBeGreaterThan(0);
    expect(result.matchedInterviewerPatterns.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Mixed');
  });

  it('returns role results with matched-phrase reasons and method "rules"', () => {
    const result = classifyWithRules('My name is Jay and I worked on trading systems.');
    expect(result.role).toBe('candidate');
    expect(result.method).toBe('rules');
    expect(result.reasons).toContain('Matched candidate phrase "my name is"');
    expect(result.score).toBeGreaterThan(0.55);
  });

  it('returns neutral with an explanatory reason when nothing matches', () => {
    const result = classifyWithRules('Okay, sounds good to me.');
    expect(result.role).toBe('neutral');
    expect(result.reasons.join(' ')).toContain('No high-precision role phrases matched');
  });

  it('is deterministic', () => {
    const text = 'My name is Jay and I worked on trading systems.';
    expect(classifyWithRules(text)).toEqual(classifyWithRules(text));
  });
});

/* ------------------------------------------------------------------ */
/* Semantic classifier                                                 */
/* ------------------------------------------------------------------ */

describe('semantic classifier', () => {
  it('detects candidate-like paraphrases with no rule phrases', () => {
    // No CANDIDATE_PATTERNS phrase appears in this sentence.
    const result = classifyWithSemanticSimilarity(
      'During the internship at that startup I mostly wrote backend APIs.',
    );
    expect(result.role).toBe('candidate');
    expect(result.method).toBe('semantic');
    expect(result.reasons[0]).toContain('Semantically closest to candidate example');
  });

  it('detects interviewer-like paraphrases with no rule phrases', () => {
    const result = classifyWithSemanticSimilarity(
      'Please describe your weaknesses and your strengths for us.',
    );
    expect(result.role).toBe('interviewer');
    expect(result.reasons[0]).toContain('Semantically closest to interviewer example');
  });

  it('treats unrelated small talk as neutral', () => {
    const result = classifyWithSemanticSimilarity('Bananas are rich in potassium.');
    expect(result.role).toBe('neutral');
  });

  it('treats meeting logistics as neutral, not interviewer', () => {
    const result = classifyWithSemanticSimilarity('Can everyone hear me okay?');
    expect(result.role).toBe('neutral');
  });

  it('produces scorer-compatible likelihoods around the 0.4 neutral baseline', () => {
    const neutral = classifyWithSemanticSimilarity('Bananas are rich in potassium.');
    expect(neutral.analysis!.candidateLikelihood).toBeCloseTo(0.4, 1);
    expect(neutral.analysis!.interviewerLikelihood).toBeCloseTo(0.4, 1);

    const candidate = classifyWithSemanticSimilarity(
      'During the internship at that startup I mostly wrote backend APIs.',
    );
    expect(candidate.analysis!.candidateLikelihood).toBeGreaterThan(
      candidate.analysis!.interviewerLikelihood,
    );
  });

  it('is deterministic', () => {
    const text = 'During the internship at that startup I mostly wrote backend APIs.';
    expect(classifyWithSemanticSimilarity(text)).toEqual(classifyWithSemanticSimilarity(text));
  });
});

/* ------------------------------------------------------------------ */
/* Hybrid classifier                                                   */
/* ------------------------------------------------------------------ */

describe('hybrid classifier', () => {
  it('lets strong rule matches dominate (method "rules")', () => {
    const result = classifyHybrid('My name is Ananya and I built a fraud detection dashboard.');
    expect(result.role).toBe('candidate');
    expect(result.method).toBe('rules');
    expect(result.reasons.some((r) => r.startsWith('Matched candidate phrase'))).toBe(true);
  });

  it('falls back to semantic similarity for paraphrases (method "semantic")', () => {
    const result = classifyHybrid(
      'During the internship at that startup I mostly wrote backend APIs.',
    );
    expect(result.role).toBe('candidate');
    expect(result.method).toBe('semantic');
    expect(result.reasons[0]).toContain('Semantically closest to candidate example');
  });

  it('boosts confidence when rules and semantic agree', () => {
    const rules = classifyWithRules('Tell me about your strengths and weaknesses.');
    const hybrid = classifyHybrid('Tell me about your strengths and weaknesses.');
    expect(hybrid.role).toBe('interviewer');
    expect(hybrid.score).toBeGreaterThan(rules.score);
  });

  it('lowers confidence and keeps both reasons on conflict', () => {
    // "next question" matches an interviewer rule, but the sentence body is
    // dense with candidate-project vocabulary the semantic bank recognizes.
    const text =
      'Next question is about the fraud detection dashboard built using React and TypeScript.';
    const rules = classifyWithRules(text);
    const hybrid = classifyHybrid(text);
    expect(hybrid.score).toBeLessThan(rules.score);
    expect(hybrid.reasons.some((r) => r.includes('disagrees'))).toBe(true);
    expect(hybrid.reasons.some((r) => r.startsWith('Matched interviewer phrase'))).toBe(true);
    expect(hybrid.reasons.some((r) => r.includes('Semantically closest to candidate'))).toBe(true);
  });

  it('classifies neutral utterances as neutral', () => {
    const result = classifyHybrid('Okay, give me one second.');
    expect(result.role).toBe('neutral');
  });

  it('is deterministic', () => {
    const text = 'In my internship I worked on backend APIs.';
    expect(classifyHybrid(text)).toEqual(classifyHybrid(text));
    expect(analyzeUtterance(text)).toEqual(analyzeUtterance(text));
  });

  it('produces a scorer-ready analysis with method and reasons attached', () => {
    const analysis = analyzeUtterance('My final year project was about computer vision.');
    expect(analysis.candidateLikelihood).toBeGreaterThan(0.55);
    expect(analysis.method).toBeDefined();
    expect(analysis.reasons!.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Interface bridging                                                  */
/* ------------------------------------------------------------------ */

describe('toTranscriptAnalysis', () => {
  it('derives conservative likelihoods for minimal results without detail', () => {
    const analysis = toTranscriptAnalysis({
      role: 'candidate',
      score: 0.8,
      reasons: ['test'],
      method: 'llm',
    });
    expect(analysis.candidateLikelihood).toBeGreaterThan(analysis.interviewerLikelihood);
    expect(analysis.method).toBe('llm');
  });

  it('keeps the detailed analysis when the classifier provides one', () => {
    const result = classifyHybrid('I built a payments service during my internship.');
    const analysis = toTranscriptAnalysis(result);
    expect(analysis.candidateLikelihood).toBe(result.analysis!.candidateLikelihood);
    expect(analysis.reasons).toEqual(result.reasons);
  });
});
