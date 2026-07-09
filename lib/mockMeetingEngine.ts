import { analyzeUtterance } from './classifiers/hybridTranscriptClassifier';
import { scoreMeetingState } from './scorer';
import { toTranscriptAnalysis, type TranscriptRoleClassifier } from './transcriptRoleClassifier';
import type {
  MeetingEvent,
  MeetingRuntimeState,
  MeetingScenario,
  ParticipantId,
  ParticipantRuntimeState,
  SpeechPayload,
  TranscriptAnalysis,
  TranscriptPayload,
} from './types';

/**
 * Deterministic event replay engine.
 *
 * Events are applied one at a time through a pure reducer; after every event
 * the full scoring engine re-runs and the decision + score history are
 * updated. In production the same reducer would sit behind a WebSocket/Kafka
 * consumer receiving real platform events instead of scenario JSON.
 */

function createParticipantRuntime(
  id: ParticipantId,
  displayName: string,
  email: string | undefined,
  isHost: boolean | undefined,
): ParticipantRuntimeState {
  return {
    id,
    currentDisplayName: displayName,
    email,
    isHost,
    joined: false,
    webcamOn: null,
    screenSharing: false,
    hasEverScreenShared: false,
    screenShareWhileCandidateLike: false,
    totalSpeakingSeconds: 0,
    speakingTurnCount: 0,
    utterances: [],
    nameHistory: [displayName],
  };
}

export function createRuntimeState(scenario: MeetingScenario): MeetingRuntimeState {
  const participants: Record<ParticipantId, ParticipantRuntimeState> = {};
  const participantOrder: ParticipantId[] = [];
  for (const p of scenario.participants) {
    participants[p.id] = createParticipantRuntime(p.id, p.displayName, p.email, p.isHost);
    participantOrder.push(p.id);
  }

  const base: Omit<MeetingRuntimeState, 'decision'> = {
    metadata: scenario.metadata,
    participants,
    participantOrder,
    allEvents: scenario.events,
    processedEvents: [],
    currentEventIndex: 0,
    transcriptEventCount: 0,
    previousSmoothedScores: {},
    scoreHistory: [],
  };

  return { ...base, decision: scoreMeetingState(base) };
}

/** Applies a single event to a participant's runtime state. Pure — returns a new object. */
function reduceParticipant(
  participant: ParticipantRuntimeState,
  event: MeetingEvent,
  transcriptAnalysisOverride?: TranscriptAnalysis,
): ParticipantRuntimeState {
  const next: ParticipantRuntimeState = {
    ...participant,
    utterances: participant.utterances,
    nameHistory: participant.nameHistory,
    lastActivityTime: event.timestamp,
  };

  switch (event.type) {
    case 'join':
      next.joined = true;
      next.joinTime = next.joinTime ?? event.timestamp;
      next.leaveTime = undefined;
      break;
    case 'leave':
      next.leaveTime = event.timestamp;
      break;
    case 'display_name_change': {
      const newName = String(event.payload.newDisplayName ?? participant.currentDisplayName);
      next.currentDisplayName = newName;
      next.nameHistory = [...participant.nameHistory, newName];
      break;
    }
    case 'webcam_on':
      next.webcamOn = true;
      break;
    case 'webcam_off':
      next.webcamOn = false;
      break;
    case 'screen_share_start': {
      next.screenSharing = true;
      next.hasEverScreenShared = true;
      // Was this participant already behaving like a candidate when they shared?
      const candidateTurns = participant.utterances.filter(
        (u) => u.analysis.candidateLikelihood > 0.55,
      ).length;
      const interviewerTurns = participant.utterances.filter(
        (u) => u.analysis.interviewerLikelihood > 0.55,
      ).length;
      if (candidateTurns > interviewerTurns && candidateTurns > 0) {
        next.screenShareWhileCandidateLike = true;
      }
      break;
    }
    case 'screen_share_stop':
      next.screenSharing = false;
      break;
    case 'speech_activity': {
      const payload = event.payload as unknown as SpeechPayload;
      next.totalSpeakingSeconds = participant.totalSpeakingSeconds + (payload.durationSeconds ?? 0);
      next.speakingTurnCount = participant.speakingTurnCount + 1;
      break;
    }
    case 'transcript': {
      const payload = event.payload as unknown as TranscriptPayload;
      const text = payload.text ?? '';
      next.utterances = [
        ...participant.utterances,
        {
          text,
          durationSeconds: payload.durationSeconds ?? 0,
          timestamp: event.timestamp,
          // A pre-computed analysis (e.g. from the LLM classifier) wins;
          // otherwise the default offline hybrid classifier (rules +
          // semantic similarity) runs synchronously.
          analysis: transcriptAnalysisOverride ?? analyzeUtterance(text),
        },
      ];
      next.totalSpeakingSeconds =
        participant.totalSpeakingSeconds + (payload.durationSeconds ?? 0);
      next.speakingTurnCount = participant.speakingTurnCount + 1;
      break;
    }
  }

  return next;
}

/** Applies one meeting event, re-scores every participant, and appends to the score history. */
export function applyMeetingEvent(
  state: MeetingRuntimeState,
  event: MeetingEvent,
  transcriptAnalysisOverride?: TranscriptAnalysis,
): MeetingRuntimeState {
  const participant = state.participants[event.participantId];
  const participants = participant
    ? {
        ...state.participants,
        [event.participantId]: reduceParticipant(participant, event, transcriptAnalysisOverride),
      }
    : state.participants;

  const processedEvents = [...state.processedEvents, event];
  const transcriptEventCount =
    state.transcriptEventCount + (event.type === 'transcript' ? 1 : 0);

  const scoringInput = {
    metadata: state.metadata,
    participants,
    participantOrder: state.participantOrder,
    processedEvents,
    transcriptEventCount,
    previousSmoothedScores: state.previousSmoothedScores,
  };
  const decision = scoreMeetingState(scoringInput);

  const previousSmoothedScores: Record<ParticipantId, number> = {};
  const historyScores: Record<ParticipantId, number> = {};
  for (const score of decision.scores) {
    previousSmoothedScores[score.participantId] = score.score;
    historyScores[score.participantId] = score.score;
  }

  return {
    ...state,
    participants,
    processedEvents,
    transcriptEventCount,
    currentEventIndex: state.currentEventIndex + 1,
    decision,
    previousSmoothedScores,
    scoreHistory: [
      ...state.scoreHistory,
      {
        eventId: event.id,
        timestamp: event.timestamp,
        scores: historyScores,
        selectedParticipantId: decision.selectedParticipantId,
        status: decision.status,
      },
    ],
  };
}

/**
 * Advances the replay by one event. Returns the same state when the scenario
 * is finished. When `transcriptAnalyses` is provided (e.g. LLM classification
 * results keyed by event id), transcript events use those analyses instead of
 * the deterministic classifier; events without an entry fall back gracefully.
 */
export function stepForward(
  state: MeetingRuntimeState,
  transcriptAnalyses?: Record<string, TranscriptAnalysis>,
): MeetingRuntimeState {
  if (state.currentEventIndex >= state.allEvents.length) return state;
  const event = state.allEvents[state.currentEventIndex];
  return applyMeetingEvent(state, event, transcriptAnalyses?.[event.id]);
}

/**
 * Classifies every transcript event in a list with the given classifier
 * (sequentially, to stay gentle on rate limits) and returns analyses keyed
 * by event id. Throws on the first classifier error — callers fall back to
 * the deterministic classifier and surface the message.
 */
export async function classifyTranscriptEvents(
  events: MeetingEvent[],
  classifier: TranscriptRoleClassifier,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, TranscriptAnalysis>> {
  const transcriptEvents = events.filter((e) => e.type === 'transcript');
  const analyses: Record<string, TranscriptAnalysis> = {};
  let done = 0;
  onProgress?.(0, transcriptEvents.length);
  for (const event of transcriptEvents) {
    const text = String((event.payload as unknown as TranscriptPayload).text ?? '');
    analyses[event.id] = toTranscriptAnalysis(await classifier.classifyUtterance(text));
    done += 1;
    onProgress?.(done, transcriptEvents.length);
  }
  return analyses;
}

export function isFinished(state: MeetingRuntimeState): boolean {
  return state.currentEventIndex >= state.allEvents.length;
}

/** Runs a scenario start-to-finish. Used by tests and the evaluation script. */
export function runScenarioToEnd(scenario: MeetingScenario): MeetingRuntimeState {
  let state = createRuntimeState(scenario);
  while (!isFinished(state)) {
    state = stepForward(state);
  }
  return state;
}
