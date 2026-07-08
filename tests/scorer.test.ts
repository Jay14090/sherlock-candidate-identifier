import { describe, expect, it } from 'vitest';
import { getScenarioById, scenarios } from '@/data/scenarios';
import { createRuntimeState, runScenarioToEnd, stepForward } from '@/lib/mockMeetingEngine';
import { scoreEmailMatch } from '@/lib/scorer';
import type { MeetingScenario, ParticipantRuntimeState, ParticipantScore } from '@/lib/types';

function mustGet(id: string): MeetingScenario {
  const scenario = getScenarioById(id);
  if (!scenario) throw new Error(`Scenario ${id} not found`);
  return scenario;
}

function scoreOf(scores: ParticipantScore[], participantId: string): ParticipantScore {
  const found = scores.find((s) => s.participantId === participantId);
  if (!found) throw new Error(`No score for ${participantId}`);
  return found;
}

function makeParticipant(overrides: Partial<ParticipantRuntimeState>): ParticipantRuntimeState {
  return {
    id: 'px',
    currentDisplayName: 'Test Person',
    joined: true,
    webcamOn: null,
    screenSharing: false,
    hasEverScreenShared: false,
    screenShareWhileCandidateLike: false,
    totalSpeakingSeconds: 0,
    speakingTurnCount: 0,
    utterances: [],
    nameHistory: ['Test Person'],
    ...overrides,
  };
}

describe('decision lifecycle (useful-evidence rule)', () => {
  it('starts with insufficient data before anyone joins', () => {
    const state = createRuntimeState(mustGet('clear-match'));
    expect(state.decision.status).toBe('insufficient_data');
  });

  it('never selects anyone while the leader only has generic events (joins/webcam)', () => {
    const scenario = mustGet('device-name');
    let state = createRuntimeState(scenario);
    // First 5 events are joins + webcam only; the leader (device-name p2)
    // has no identity, email, or transcript evidence yet.
    for (let i = 0; i < 5; i++) {
      state = stepForward(state);
      expect(state.decision.status).not.toBe('selected');
    }
    expect(state.decision.status).toBe('insufficient_data');
  });

  it('becomes decidable once useful transcript evidence exists for the leader', () => {
    const scenario = mustGet('device-name');
    let state = createRuntimeState(scenario);
    for (let i = 0; i < 7; i++) state = stepForward(state); // through p2's first utterance
    expect(['uncertain', 'selected']).toContain(state.decision.status);
  });
});

describe('email matching (public vs organization domains)', () => {
  const metadataWith = (candidateEmail: string) => ({
    candidateEmail,
    scheduledStartTime: '2026-07-08T10:00:00+05:30',
    interviewerNames: [],
  });

  it('treats a shared public domain as neutral, not supporting evidence', () => {
    const result = scoreEmailMatch(
      metadataWith('jay@gmail.com'),
      makeParticipant({ email: 'random@gmail.com' }),
    );
    expect(result.score).toBe(0.4);
  });

  it('keeps weak support for a shared organization-specific domain', () => {
    const result = scoreEmailMatch(
      metadataWith('jay@acme-corp.com'),
      makeParticipant({ email: 'someone.else@acme-corp.com' }),
    );
    expect(result.score).toBe(0.25);
  });

  it('still scores exact matches on public domains as strong evidence', () => {
    const result = scoreEmailMatch(
      metadataWith('jay@gmail.com'),
      makeParticipant({ email: 'jay@gmail.com' }),
    );
    expect(result.score).toBe(1);
  });
});

describe('evidence coverage', () => {
  it('reports high coverage for the selected candidate at the end of clear-match', () => {
    const finalState = runScenarioToEnd(mustGet('clear-match'));
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.evidenceCoverage).toBeGreaterThanOrEqual(0.6);
    expect(p2.activeSignalCategories).toContain('identity');
    expect(p2.activeSignalCategories).toContain('transcript');
  });

  it('exposes the leader coverage on the decision and keeps it within bounds', () => {
    for (const scenario of scenarios) {
      const finalState = runScenarioToEnd(scenario);
      expect(finalState.decision.evidenceCoverage).toBeGreaterThanOrEqual(0);
      expect(finalState.decision.evidenceCoverage).toBeLessThanOrEqual(1);
    }
  });
});

describe('clear-match scenario', () => {
  const finalState = runScenarioToEnd(mustGet('clear-match'));

  it('selects the correct candidate with a high candidate score', () => {
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
    expect(finalState.decision.candidateScore).toBeGreaterThan(0.75);
  });

  it('scores the known interviewer far below the candidate', () => {
    const p1 = scoreOf(finalState.decision.scores, 'p1');
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.score - p1.score).toBeGreaterThan(0.3);
  });

  it('produces positive evidence for the selected candidate', () => {
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.evidence.some((e) => e.direction === 'positive' && e.signal === 'Name Match')).toBe(true);
    expect(p2.evidence.some((e) => e.direction === 'positive' && e.signal === 'Email Match')).toBe(true);
  });
});

describe('device-name scenario', () => {
  const scenario = mustGet('device-name');

  it('is not confident about the device-name participant early on', () => {
    let state = createRuntimeState(scenario);
    // Apply the first 5 events: joins + webcam only, before any transcript from p2.
    for (let i = 0; i < 5; i++) state = stepForward(state);
    expect(state.decision.status).not.toBe('selected');
  });

  it('eventually selects the device-name participant from behavioral evidence', () => {
    const finalState = runScenarioToEnd(scenario);
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
  });

  it('rewards the mid-meeting rename toward the candidate name', () => {
    const finalState = runScenarioToEnd(scenario);
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.breakdown.consistency).toBeGreaterThan(0.6);
    expect(p2.evidence.some((e) => e.message.includes('changed display name'))).toBe(true);
  });
});

describe('nickname scenario', () => {
  it('selects the abbreviated-name participant', () => {
    const finalState = runScenarioToEnd(mustGet('nickname'));
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
  });
});

describe('multiple-interviewers-observers scenario', () => {
  const finalState = runScenarioToEnd(mustGet('multiple-interviewers-observers'));

  it('selects the candidate, not the talkative interviewer', () => {
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
  });

  it('penalizes the known interviewer despite high speaking time', () => {
    const p1 = scoreOf(finalState.decision.scores, 'p1');
    expect(p1.score).toBeLessThan(0.4);
    expect(p1.breakdown.interviewerExclusion).toBeLessThan(0.2);
  });

  it('scores the silent observer low', () => {
    const p4 = scoreOf(finalState.decision.scores, 'p4');
    expect(p4.score).toBeLessThan(0.5);
  });
});

describe('missing-metadata scenario', () => {
  const finalState = runScenarioToEnd(mustGet('missing-metadata'));

  it('still selects the candidate using the email local-part and behavior', () => {
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
  });

  it('treats the missing candidate name as neutral, not negative', () => {
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.breakdown.nameMatch).toBeGreaterThanOrEqual(0.4);
  });
});

describe('ambiguous scenario', () => {
  const finalState = runScenarioToEnd(mustGet('ambiguous'));

  it('refuses to select when the top two are too close', () => {
    expect(finalState.decision.status).toBe('uncertain');
    expect(finalState.decision.selectedParticipantId).toBeNull();
  });

  it('explains the abstention', () => {
    expect(finalState.decision.explanation.toLowerCase()).toContain('uncertain');
  });
});

describe('wrong-name scenario', () => {
  const finalState = runScenarioToEnd(mustGet('wrong-name'));

  it('overrides the incorrect metadata name using the exact email match', () => {
    expect(finalState.decision.status).toBe('selected');
    expect(finalState.decision.selectedParticipantId).toBe('p2');
    const p2 = scoreOf(finalState.decision.scores, 'p2');
    expect(p2.breakdown.emailMatch).toBe(1);
  });
});

describe('robustness', () => {
  it('never crashes while replaying any scenario event-by-event', () => {
    for (const scenario of scenarios) {
      let state = createRuntimeState(scenario);
      for (let i = 0; i < scenario.events.length; i++) {
        state = stepForward(state);
        expect(state.decision.scores.length).toBe(scenario.participants.length);
        for (const score of state.decision.scores) {
          expect(score.score).toBeGreaterThanOrEqual(0);
          expect(score.score).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('smoothing prevents wild single-event jumps once history exists', () => {
    const scenario = mustGet('device-name');
    let state = createRuntimeState(scenario);
    let previous: number | undefined;
    for (let i = 0; i < scenario.events.length; i++) {
      state = stepForward(state);
      const p2 = state.decision.scores.find((s) => s.participantId === 'p2')!;
      if (previous !== undefined) {
        expect(Math.abs(p2.score - previous)).toBeLessThan(0.25);
      }
      previous = p2.score;
    }
  });
});
