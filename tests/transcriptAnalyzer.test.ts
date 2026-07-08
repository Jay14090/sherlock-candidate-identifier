import { describe, expect, it } from 'vitest';
import { analyzeTranscript } from '@/lib/transcriptAnalyzer';

describe('analyzeTranscript', () => {
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

  it('is deterministic', () => {
    const text = 'My name is Jay and I worked on trading systems.';
    expect(analyzeTranscript(text)).toEqual(analyzeTranscript(text));
  });
});
