import { describe, expect, it } from 'vitest';
import { getScenarioById } from '@/data/scenarios';
import {
  classifyTranscriptEvents,
  createRuntimeState,
  isFinished,
  stepForward,
} from '@/lib/mockMeetingEngine';
import type { TranscriptAnalysis, TranscriptRoleClassifier } from '@/lib/types';

function mustGet(id: string) {
  const scenario = getScenarioById(id);
  if (!scenario) throw new Error(`Scenario ${id} not found`);
  return scenario;
}

const candidateLikeAnalysis: TranscriptAnalysis = {
  candidateLikelihood: 0.9,
  interviewerLikelihood: 0.1,
  matchedCandidatePatterns: [],
  matchedInterviewerPatterns: [],
  summary: 'LLM (stub): clearly a candidate answering.',
};

/** Deterministic stand-in for the LLM classifier — no network calls in tests. */
const stubClassifier: TranscriptRoleClassifier = {
  classify: async () => candidateLikeAnalysis,
};

describe('classifyTranscriptEvents', () => {
  it('classifies exactly the transcript events, keyed by event id', async () => {
    const scenario = mustGet('clear-match');
    const analyses = await classifyTranscriptEvents(scenario.events, stubClassifier);
    const transcriptIds = scenario.events.filter((e) => e.type === 'transcript').map((e) => e.id);
    expect(Object.keys(analyses).sort()).toEqual([...transcriptIds].sort());
  });

  it('reports progress from 0 to total', async () => {
    const scenario = mustGet('clear-match');
    const updates: Array<[number, number]> = [];
    await classifyTranscriptEvents(scenario.events, stubClassifier, (done, total) =>
      updates.push([done, total]),
    );
    const total = scenario.events.filter((e) => e.type === 'transcript').length;
    expect(updates[0]).toEqual([0, total]);
    expect(updates[updates.length - 1]).toEqual([total, total]);
  });

  it('propagates classifier errors so callers can fall back', async () => {
    const failing: TranscriptRoleClassifier = {
      classify: async () => {
        throw new Error('401 invalid api key');
      },
    };
    await expect(classifyTranscriptEvents(mustGet('clear-match').events, failing)).rejects.toThrow(
      '401',
    );
  });
});

describe('stepForward with pre-computed analyses', () => {
  it('uses the provided analysis for transcript events instead of keywords', () => {
    const scenario = mustGet('clear-match');
    // Give every transcript event a stub LLM analysis.
    const analyses: Record<string, TranscriptAnalysis> = {};
    for (const event of scenario.events) {
      if (event.type === 'transcript') analyses[event.id] = candidateLikeAnalysis;
    }

    let state = createRuntimeState(scenario);
    while (!isFinished(state)) state = stepForward(state, analyses);

    const p2 = state.participants['p2'];
    expect(p2.utterances.length).toBeGreaterThan(0);
    for (const utterance of p2.utterances) {
      expect(utterance.analysis.summary).toContain('LLM (stub)');
      expect(utterance.analysis.candidateLikelihood).toBe(0.9);
    }
    // The engine still reaches a sane decision with LLM-shaped analyses.
    expect(state.decision.status).toBe('selected');
    expect(state.decision.selectedParticipantId).toBe('p2');
  });

  it('falls back to the deterministic classifier for events without an entry', () => {
    const scenario = mustGet('clear-match');
    let state = createRuntimeState(scenario);
    while (!isFinished(state)) state = stepForward(state, {}); // empty map = all fallback

    const p2 = state.participants['p2'];
    expect(p2.utterances[0].analysis.matchedCandidatePatterns.length).toBeGreaterThan(0);
    expect(state.decision.selectedParticipantId).toBe('p2');
  });
});
