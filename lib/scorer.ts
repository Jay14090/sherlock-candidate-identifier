import {
  CANDIDATE_TURN_LIKELIHOOD,
  INTERVIEWER_TURN_LIKELIHOOD,
  MARGIN_THRESHOLD,
  NEUTRAL_SCORE,
  PUBLIC_EMAIL_DOMAINS,
  SELECTION_THRESHOLD,
  SIGNAL_WEIGHTS,
  SILENCE_EVENT_THRESHOLD,
  SMOOTHING_CURRENT,
  SMOOTHING_PREVIOUS,
} from './constants';
import { makeEvidence, round4, sortEvidence } from './evidence';
import {
  compareNames,
  emailDomain,
  emailLocalPart,
  emailLocalPartResemblance,
  isDeviceLikeName,
} from './normalization';
import type {
  CandidateDecision,
  CandidateMetadata,
  EvidenceItem,
  MeetingRuntimeState,
  ParticipantRuntimeState,
  ParticipantScore,
  SignalBreakdown,
  SignalCategory,
} from './types';

interface SignalResult {
  score: number;
  evidence: EvidenceItem[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/* 9.1 Name similarity                                                 */
/* ------------------------------------------------------------------ */

export function scoreNameMatch(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.nameMatch;
  const evidence: EvidenceItem[] = [];
  const displayName = participant.currentDisplayName;

  if (isDeviceLikeName(displayName)) {
    const score = 0.15;
    evidence.push(
      makeEvidence(
        'Name Match',
        score,
        weight,
        `Display name "${displayName}" appears to be a device or placeholder name, so name evidence is weak — but this participant is not ruled out.`,
      ),
    );
    return { score, evidence };
  }

  if (!metadata.candidateName) {
    // No candidate name to compare against. Fall back to email local-part if we have one.
    if (metadata.candidateEmail) {
      const resemblance = emailLocalPartResemblance(metadata.candidateEmail, displayName);
      if (resemblance.score >= 0.65) {
        const score = 0.65;
        evidence.push(
          makeEvidence(
            'Name Match',
            score,
            weight,
            `Candidate name is missing, but the candidate email local-part "${emailLocalPart(metadata.candidateEmail)}" resembles display name "${displayName}".`,
          ),
        );
        return { score, evidence };
      }
    }
    const score = NEUTRAL_SCORE;
    evidence.push(
      makeEvidence(
        'Name Match',
        score,
        weight,
        'Candidate name is missing from metadata; name signal treated as neutral rather than negative.',
      ),
    );
    return { score, evidence };
  }

  // Compare against the current name and every historical name (a candidate
  // may fix their display name mid-meeting). Historical matches are slightly
  // discounted versus the current name.
  const currentComparison = compareNames(metadata.candidateName, displayName);
  let best = currentComparison.score;
  let bestSource = `display name "${displayName}"`;
  for (const pastName of participant.nameHistory) {
    if (pastName === displayName) continue;
    const past = compareNames(metadata.candidateName, pastName);
    const discounted = past.score * 0.9;
    if (discounted > best) {
      best = discounted;
      bestSource = `earlier display name "${pastName}"`;
    }
  }

  // Email local-part can rescue a weak name match (nickname vs full legal name).
  if (metadata.candidateEmail && best < 0.65) {
    const resemblance = emailLocalPartResemblance(metadata.candidateEmail, displayName);
    if (resemblance.score >= 0.65) {
      best = 0.65;
      bestSource = `candidate email local-part "${emailLocalPart(metadata.candidateEmail)}"`;
    }
  }

  const score = clamp01(best);
  if (score >= 0.85) {
    evidence.push(
      makeEvidence('Name Match', score, weight, `${capitalize(bestSource)} closely matches candidate name "${metadata.candidateName}".`),
    );
  } else if (score >= 0.6) {
    evidence.push(
      makeEvidence('Name Match', score, weight, `${capitalize(bestSource)} partially matches candidate name "${metadata.candidateName}" (nickname or abbreviation).`),
    );
  } else if (score >= 0.45) {
    evidence.push(
      makeEvidence('Name Match', score, weight, `${capitalize(bestSource)} weakly resembles candidate name "${metadata.candidateName}".`),
    );
  } else {
    evidence.push(
      makeEvidence('Name Match', score, weight, `Display name "${displayName}" does not resemble candidate name "${metadata.candidateName}".`),
    );
  }
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.2 Email match                                                     */
/* ------------------------------------------------------------------ */

export function scoreEmailMatch(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.emailMatch;
  const evidence: EvidenceItem[] = [];

  if (!metadata.candidateEmail) {
    const score = NEUTRAL_SCORE;
    evidence.push(
      makeEvidence('Email Match', score, weight, 'Candidate email was not provided, so email evidence is treated as neutral.'),
    );
    return { score, evidence };
  }
  if (!participant.email) {
    const score = NEUTRAL_SCORE;
    evidence.push(
      makeEvidence('Email Match', score, weight, 'Meeting platform did not expose an email for this participant; email evidence is neutral.'),
    );
    return { score, evidence };
  }

  const candidate = metadata.candidateEmail.toLowerCase();
  const actual = participant.email.toLowerCase();
  let score: number;
  let message: string;

  if (candidate === actual) {
    score = 1.0;
    message = `Participant email exactly matches candidate email ${metadata.candidateEmail}.`;
  } else if (emailLocalPart(candidate) === emailLocalPart(actual)) {
    score = 0.75;
    message = 'Participant email has the same local-part as the candidate email but a different domain.';
  } else if (emailDomain(candidate) === emailDomain(actual)) {
    // A shared public domain (gmail.com etc.) carries no identity information.
    if (PUBLIC_EMAIL_DOMAINS.includes(emailDomain(candidate))) {
      score = NEUTRAL_SCORE;
      message = `Both emails use the public provider ${emailDomain(candidate)} — this is coincidental, so email evidence stays neutral.`;
    } else {
      score = 0.25;
      message = 'Participant email shares an organization-specific domain with the candidate email — weak supporting evidence only.';
    }
  } else {
    score = 0.1;
    message = 'Participant email does not match the candidate email.';
  }

  evidence.push(makeEvidence('Email Match', score, weight, message));
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.3 Interviewer exclusion (1.0 = definitely NOT an interviewer)     */
/* ------------------------------------------------------------------ */

export function scoreInterviewerExclusion(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.interviewerExclusion;
  const evidence: EvidenceItem[] = [];

  // Hard identity evidence: email match against known interviewer emails.
  if (participant.email && metadata.interviewerEmails) {
    const email = participant.email.toLowerCase();
    if (metadata.interviewerEmails.some((e) => e.toLowerCase() === email)) {
      const score = 0.02;
      evidence.push(
        makeEvidence('Interviewer Exclusion', score, weight, 'Participant email matches a known interviewer email.'),
      );
      return { score, evidence };
    }
  }

  // Name evidence against the interviewer list (current + historical names).
  const namesToCheck = [participant.currentDisplayName, ...participant.nameHistory];
  let bestInterviewerMatch = 0;
  let matchedInterviewer = '';
  for (const interviewerName of metadata.interviewerNames) {
    for (const name of namesToCheck) {
      const { score } = compareNames(interviewerName, name);
      if (score > bestInterviewerMatch) {
        bestInterviewerMatch = score;
        matchedInterviewer = interviewerName;
      }
    }
  }

  if (bestInterviewerMatch >= 0.85) {
    const score = 0.05;
    evidence.push(
      makeEvidence('Interviewer Exclusion', score, weight, `Participant matches known interviewer "${matchedInterviewer}".`),
    );
    return { score, evidence };
  }

  let score = bestInterviewerMatch >= 0.65 ? 0.3 : 0.6;
  if (bestInterviewerMatch >= 0.65) {
    evidence.push(
      makeEvidence('Interviewer Exclusion', score, weight, `Participant name partially resembles interviewer "${matchedInterviewer}".`),
    );
  }

  // Soft penalty only — a candidate can be host in some setups.
  if (participant.isHost) {
    score -= 0.15;
    evidence.push(
      makeEvidence(
        'Interviewer Exclusion',
        0.25,
        weight,
        'Participant is the meeting host, which usually (but not always) indicates an interviewer.',
      ),
    );
  }

  // Behavioral evidence from transcript roles.
  const { candidateTurns, interviewerTurns } = countRoleTurns(participant);
  if (interviewerTurns >= 2 && interviewerTurns > candidateTurns) {
    score = Math.min(score, 0.15);
    evidence.push(
      makeEvidence(
        'Interviewer Exclusion',
        0.15,
        weight,
        `Participant's transcript contains mostly interviewer-style questions (${interviewerTurns} question-style turns).`,
      ),
    );
  } else if (candidateTurns >= 2 && candidateTurns > interviewerTurns) {
    score = Math.min(0.95, score + 0.3);
    evidence.push(
      makeEvidence(
        'Interviewer Exclusion',
        score,
        weight,
        'Participant behaves like an answerer, not an interviewer — no interviewer indicators found.',
      ),
    );
  }

  score = clamp01(score);
  if (evidence.length === 0) {
    evidence.push(
      makeEvidence(
        'Interviewer Exclusion',
        score,
        weight,
        'No indication that this participant is an interviewer.',
      ),
    );
  }
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.4 Join timing                                                     */
/* ------------------------------------------------------------------ */

export function scoreJoinTiming(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.joinTiming;
  const evidence: EvidenceItem[] = [];

  if (!participant.joinTime) {
    const score = NEUTRAL_SCORE;
    evidence.push(makeEvidence('Join Timing', score, weight, 'Participant has not joined yet; join timing is neutral.'));
    return { score, evidence };
  }

  const scheduled = Date.parse(metadata.scheduledStartTime);
  const joined = Date.parse(participant.joinTime);
  if (Number.isNaN(scheduled) || Number.isNaN(joined)) {
    const score = NEUTRAL_SCORE;
    evidence.push(makeEvidence('Join Timing', score, weight, 'Join or scheduled time missing/unparseable; treated as neutral.'));
    return { score, evidence };
  }

  const diffMinutes = (joined - scheduled) / 60000; // positive = joined after start
  let score: number;
  let message: string;

  if (diffMinutes < -5) {
    score = 0.45;
    message = `Joined ${Math.round(-diffMinutes)} minutes before the scheduled start — typical of interviewers or hosts.`;
  } else if (Math.abs(diffMinutes) <= 5) {
    score = 0.8;
    message = 'Joined within 5 minutes of the scheduled interview start — typical candidate behavior.';
  } else if (diffMinutes <= 15) {
    score = 0.55;
    message = `Joined ${Math.round(diffMinutes)} minutes after the scheduled start — slightly late but plausible.`;
  } else {
    score = 0.35;
    message = `Joined ${Math.round(diffMinutes)} minutes after the scheduled start — unusually late for a candidate.`;
  }

  evidence.push(makeEvidence('Join Timing', score, weight, message));
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.5 Speaking pattern                                                */
/* ------------------------------------------------------------------ */

function countRoleTurns(participant: ParticipantRuntimeState): {
  candidateTurns: number;
  interviewerTurns: number;
} {
  let candidateTurns = 0;
  let interviewerTurns = 0;
  for (const utterance of participant.utterances) {
    if (utterance.analysis.candidateLikelihood > CANDIDATE_TURN_LIKELIHOOD) candidateTurns += 1;
    if (utterance.analysis.interviewerLikelihood > INTERVIEWER_TURN_LIKELIHOOD) interviewerTurns += 1;
  }
  return { candidateTurns, interviewerTurns };
}

export function scoreSpeakingPattern(
  participant: ParticipantRuntimeState,
  meetingTranscriptEventCount: number,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.speakingPattern;
  const evidence: EvidenceItem[] = [];
  const { candidateTurns, interviewerTurns } = countRoleTurns(participant);
  const hasSpoken = participant.utterances.length > 0 || participant.speakingTurnCount > 0;

  let score: number;
  if (!hasSpoken) {
    if (participant.joined && meetingTranscriptEventCount >= SILENCE_EVENT_THRESHOLD) {
      score = 0.25;
      evidence.push(
        makeEvidence(
          'Speaking Pattern',
          score,
          weight,
          'Participant has stayed silent while others are actively speaking — typical of an observer.',
        ),
      );
    } else {
      score = NEUTRAL_SCORE;
      evidence.push(
        makeEvidence('Speaking Pattern', score, weight, 'No speech observed yet; speaking evidence is neutral.'),
      );
    }
    return { score, evidence };
  }

  if (candidateTurns > interviewerTurns) {
    const base = participant.totalSpeakingSeconds >= 15 ? 0.7 : 0.6;
    score = Math.min(0.9, base + Math.min(0.2, 0.05 * candidateTurns));
    evidence.push(
      makeEvidence(
        'Speaking Pattern',
        score,
        weight,
        `Participant has ${candidateTurns} answer-style speaking turn${candidateTurns > 1 ? 's' : ''} — consistent with being the candidate.`,
      ),
    );
  } else if (interviewerTurns > candidateTurns) {
    score = 0.2;
    evidence.push(
      makeEvidence(
        'Speaking Pattern',
        score,
        weight,
        'Participant is mostly asking interviewer-style questions rather than answering.',
      ),
    );
  } else {
    score = 0.45;
    evidence.push(
      makeEvidence('Speaking Pattern', score, weight, 'Participant speaks, but their role is not yet clear from speech alone.'),
    );
  }
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.6 Transcript candidate-likeness                                   */
/* ------------------------------------------------------------------ */

export function scoreTranscriptLikelihood(participant: ParticipantRuntimeState): {
  candidateScore: number;
  interviewerScore: number;
  evidence: EvidenceItem[];
} {
  const weight = SIGNAL_WEIGHTS.transcriptCandidateLikelihood;
  const evidence: EvidenceItem[] = [];

  if (participant.utterances.length === 0) {
    evidence.push(
      makeEvidence('Transcript Role', NEUTRAL_SCORE, weight, 'No transcript for this participant yet; transcript evidence is neutral.'),
    );
    return { candidateScore: NEUTRAL_SCORE, interviewerScore: NEUTRAL_SCORE, evidence };
  }

  const utterances = participant.utterances;
  const avgCandidate =
    utterances.reduce((sum, u) => sum + u.analysis.candidateLikelihood, 0) / utterances.length;
  const avgInterviewer =
    utterances.reduce((sum, u) => sum + u.analysis.interviewerLikelihood, 0) / utterances.length;

  // Small bonus as consistent evidence accumulates.
  const countBonus = Math.min(0.08, 0.02 * utterances.length);
  const candidateScore = clamp01(Math.min(0.95, avgCandidate + (avgCandidate > 0.5 ? countBonus : 0)));
  const interviewerScore = clamp01(avgInterviewer);

  const matchedPhrases = [...new Set(utterances.flatMap((u) => u.analysis.matchedCandidatePatterns))];
  if (candidateScore > 0.55) {
    const examples = matchedPhrases.slice(0, 3).map((p) => `"${p}"`).join(', ');
    evidence.push(
      makeEvidence(
        'Transcript Role',
        candidateScore,
        weight,
        `Transcript contains candidate-style first-person phrases${examples ? ` such as ${examples}` : ''}.`,
      ),
    );
  } else if (interviewerScore > 0.55) {
    evidence.push(
      makeEvidence('Transcript Role', candidateScore, weight, 'Transcript reads like an interviewer asking questions, not a candidate answering.'),
    );
  } else {
    evidence.push(
      makeEvidence('Transcript Role', candidateScore, weight, 'Transcript exists but does not clearly indicate candidate or interviewer role.'),
    );
  }

  return { candidateScore, interviewerScore, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.7 Webcam presence                                                 */
/* ------------------------------------------------------------------ */

export function scoreWebcamPresence(
  participant: ParticipantRuntimeState,
  meetingTranscriptEventCount: number,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.webcamPresence;
  const evidence: EvidenceItem[] = [];
  let score: number;

  if (participant.webcamOn === null) {
    score = NEUTRAL_SCORE;
    evidence.push(makeEvidence('Webcam', score, weight, 'No webcam signal observed yet; treated as neutral.'));
  } else if (participant.webcamOn) {
    score = 0.6;
    evidence.push(makeEvidence('Webcam', score, weight, 'Webcam is on during the interview — mild positive signal.'));
  } else if (participant.utterances.length > 0 || participant.speakingTurnCount > 0) {
    score = 0.45;
    evidence.push(
      makeEvidence('Webcam', score, weight, 'Webcam is off but the participant is actively speaking — possibly a network or privacy choice.'),
    );
  } else if (meetingTranscriptEventCount >= 6) {
    score = 0.25;
    evidence.push(
      makeEvidence('Webcam', score, weight, 'Webcam has remained off while the participant is silent — typical of a passive observer.'),
    );
  } else {
    score = 0.35;
    evidence.push(makeEvidence('Webcam', score, weight, 'Webcam is off; too early to interpret.'));
  }

  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.8 Screen share behavior                                           */
/* ------------------------------------------------------------------ */

export function scoreScreenShare(participant: ParticipantRuntimeState): SignalResult {
  const weight = SIGNAL_WEIGHTS.screenShareBehavior;
  const evidence: EvidenceItem[] = [];
  let score: number;

  if (!participant.hasEverScreenShared) {
    score = NEUTRAL_SCORE;
    evidence.push(
      makeEvidence('Screen Share', score, weight, 'No screen share from this participant — neutral, many candidates never share.'),
    );
  } else if (participant.screenShareWhileCandidateLike) {
    score = 0.65;
    evidence.push(
      makeEvidence('Screen Share', score, weight, 'Participant shared their screen during a technical/candidate-style discussion.'),
    );
  } else {
    score = 0.5;
    evidence.push(
      makeEvidence('Screen Share', score, weight, 'Participant shared their screen, but the context does not clearly indicate a candidate.'),
    );
  }
  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* 9.9 Consistency                                                     */
/* ------------------------------------------------------------------ */

export function scoreConsistency(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
  rawPartialScore: number,
  previousSmoothedScore: number | undefined,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.consistency;
  const evidence: EvidenceItem[] = [];
  let score = NEUTRAL_SCORE;

  const firstName = participant.nameHistory[0];
  const renamedToCandidateLike =
    participant.nameHistory.length > 1 &&
    metadata.candidateName !== undefined &&
    firstName !== undefined &&
    isDeviceLikeName(firstName) &&
    compareNames(metadata.candidateName, participant.currentDisplayName).score >= 0.65;

  if (renamedToCandidateLike) {
    score = 0.85;
    evidence.push(
      makeEvidence(
        'Consistency',
        score,
        weight,
        `Participant changed display name from "${firstName}" to "${participant.currentDisplayName}", converging with the candidate identity.`,
      ),
    );
  } else if (previousSmoothedScore !== undefined) {
    if (Math.abs(rawPartialScore - previousSmoothedScore) <= 0.15) {
      score = 0.6;
      evidence.push(
        makeEvidence('Consistency', score, weight, 'Evidence for this participant has stayed consistent across recent events.'),
      );
    } else {
      score = 0.3;
      evidence.push(
        makeEvidence('Consistency', score, weight, 'Evidence for this participant is still shifting between events.'),
      );
    }
  } else {
    evidence.push(makeEvidence('Consistency', score, weight, 'Not enough history to judge consistency yet.'));
  }

  return { score, evidence };
}

/* ------------------------------------------------------------------ */
/* Evidence coverage + decision eligibility                            */
/* ------------------------------------------------------------------ */

export const ALL_SIGNAL_CATEGORIES: SignalCategory[] = [
  'identity',
  'email',
  'transcript',
  'speaking',
  'interviewerExclusion',
  'joinTiming',
  'webcam',
  'screenShare',
  'consistency',
];

/** Categories strong enough to justify a decision on their own. */
const STRONG_SIGNAL_CATEGORIES: SignalCategory[] = ['identity', 'email', 'transcript'];
/** Media-state categories are too generic to establish decision eligibility. */
const WEAK_SIGNAL_CATEGORIES: SignalCategory[] = ['webcam', 'screenShare'];

/**
 * Which signal categories have *usable evidence* for this participant —
 * independent of whether that evidence points toward or away from them
 * being the candidate. This powers the evidence-coverage metric and the
 * insufficient-data rule.
 */
export function getActiveSignalCategories(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
  meetingTranscriptEventCount: number,
): SignalCategory[] {
  const active: SignalCategory[] = [];
  const { candidateTurns, interviewerTurns } = countRoleTurns(participant);

  // Identity: we can compare a usable person-name against candidate identity.
  const hasUsableName = !isDeviceLikeName(participant.currentDisplayName);
  if (hasUsableName && (metadata.candidateName || metadata.candidateEmail)) {
    active.push('identity');
  }

  if (metadata.candidateEmail && participant.email) active.push('email');
  if (participant.utterances.length > 0) active.push('transcript');

  // Speaking is informative once the participant speaks — or once their
  // silence becomes meaningful because the meeting is active around them.
  if (
    participant.speakingTurnCount > 0 ||
    participant.utterances.length > 0 ||
    (participant.joined && meetingTranscriptEventCount >= SILENCE_EVENT_THRESHOLD)
  ) {
    active.push('speaking');
  }

  // Interviewer exclusion is informative when the participant actually matched
  // the interviewer list, or produced enough role-classified turns to judge.
  if (metadata.interviewerNames.length > 0 || metadata.interviewerEmails?.length) {
    const emailMatched =
      participant.email !== undefined &&
      (metadata.interviewerEmails ?? []).some(
        (e) => e.toLowerCase() === participant.email!.toLowerCase(),
      );
    const nameMatched = metadata.interviewerNames.some((interviewerName) =>
      [participant.currentDisplayName, ...participant.nameHistory].some(
        (name) => compareNames(interviewerName, name).score >= 0.65,
      ),
    );
    if (emailMatched || nameMatched || candidateTurns + interviewerTurns >= 2) {
      active.push('interviewerExclusion');
    }
  }

  if (participant.joinTime && !Number.isNaN(Date.parse(metadata.scheduledStartTime))) {
    active.push('joinTiming');
  }
  if (participant.webcamOn !== null) active.push('webcam');
  if (participant.hasEverScreenShared) active.push('screenShare');
  if (participant.nameHistory.length > 1) active.push('consistency');

  return active;
}

/**
 * A participant is eligible to be *decided on* only when useful evidence
 * exists: at least one strong category (identity/email/transcript), or at
 * least two distinct non-media categories. Generic events alone — a join
 * plus a webcam toggle — must never produce a selection.
 */
export function isEligibleForDecision(
  participant: ParticipantRuntimeState,
  activeCategories: SignalCategory[],
): boolean {
  if (!participant.joined) return false;
  if (activeCategories.some((c) => STRONG_SIGNAL_CATEGORIES.includes(c))) return true;
  const nonMedia = activeCategories.filter((c) => !WEAK_SIGNAL_CATEGORIES.includes(c));
  return nonMedia.length >= 2;
}

/* ------------------------------------------------------------------ */
/* Aggregate scoring + decision                                        */
/* ------------------------------------------------------------------ */

export function scoreParticipant(
  metadata: CandidateMetadata,
  participant: ParticipantRuntimeState,
  meetingTranscriptEventCount: number,
  previousSmoothedScore: number | undefined,
): ParticipantScore {
  const name = scoreNameMatch(metadata, participant);
  const email = scoreEmailMatch(metadata, participant);
  const exclusion = scoreInterviewerExclusion(metadata, participant);
  const timing = scoreJoinTiming(metadata, participant);
  const speaking = scoreSpeakingPattern(participant, meetingTranscriptEventCount);
  const transcript = scoreTranscriptLikelihood(participant);
  const webcam = scoreWebcamPresence(participant, meetingTranscriptEventCount);
  const screenShare = scoreScreenShare(participant);

  const partialWeight =
    SIGNAL_WEIGHTS.nameMatch +
    SIGNAL_WEIGHTS.emailMatch +
    SIGNAL_WEIGHTS.interviewerExclusion +
    SIGNAL_WEIGHTS.joinTiming +
    SIGNAL_WEIGHTS.speakingPattern +
    SIGNAL_WEIGHTS.transcriptCandidateLikelihood +
    SIGNAL_WEIGHTS.webcamPresence +
    SIGNAL_WEIGHTS.screenShareBehavior;

  const rawPartial =
    (name.score * SIGNAL_WEIGHTS.nameMatch +
      email.score * SIGNAL_WEIGHTS.emailMatch +
      exclusion.score * SIGNAL_WEIGHTS.interviewerExclusion +
      timing.score * SIGNAL_WEIGHTS.joinTiming +
      speaking.score * SIGNAL_WEIGHTS.speakingPattern +
      transcript.candidateScore * SIGNAL_WEIGHTS.transcriptCandidateLikelihood +
      webcam.score * SIGNAL_WEIGHTS.webcamPresence +
      screenShare.score * SIGNAL_WEIGHTS.screenShareBehavior) /
    partialWeight;

  const consistency = scoreConsistency(metadata, participant, rawPartial, previousSmoothedScore);

  const breakdown: SignalBreakdown = {
    nameMatch: round4(name.score),
    emailMatch: round4(email.score),
    interviewerExclusion: round4(exclusion.score),
    joinTiming: round4(timing.score),
    speakingPattern: round4(speaking.score),
    transcriptCandidateLikelihood: round4(transcript.candidateScore),
    transcriptInterviewerLikelihood: round4(transcript.interviewerScore),
    webcamPresence: round4(webcam.score),
    screenShareBehavior: round4(screenShare.score),
    consistency: round4(consistency.score),
  };

  const rawScore = clamp01(
    name.score * SIGNAL_WEIGHTS.nameMatch +
      email.score * SIGNAL_WEIGHTS.emailMatch +
      exclusion.score * SIGNAL_WEIGHTS.interviewerExclusion +
      timing.score * SIGNAL_WEIGHTS.joinTiming +
      speaking.score * SIGNAL_WEIGHTS.speakingPattern +
      transcript.candidateScore * SIGNAL_WEIGHTS.transcriptCandidateLikelihood +
      webcam.score * SIGNAL_WEIGHTS.webcamPresence +
      screenShare.score * SIGNAL_WEIGHTS.screenShareBehavior +
      consistency.score * SIGNAL_WEIGHTS.consistency,
  );

  // Temporal smoothing: a real-time system should not jump wildly on one event.
  const smoothed =
    previousSmoothedScore === undefined
      ? rawScore
      : previousSmoothedScore * SMOOTHING_PREVIOUS + rawScore * SMOOTHING_CURRENT;

  const evidence = sortEvidence([
    ...name.evidence,
    ...email.evidence,
    ...exclusion.evidence,
    ...timing.evidence,
    ...speaking.evidence,
    ...transcript.evidence,
    ...webcam.evidence,
    ...screenShare.evidence,
    ...consistency.evidence,
  ]);

  const activeSignalCategories = getActiveSignalCategories(
    metadata,
    participant,
    meetingTranscriptEventCount,
  );

  return {
    participantId: participant.id,
    displayName: participant.currentDisplayName,
    score: round4(clamp01(smoothed)),
    rawScore: round4(rawScore),
    scorePercent: Math.round(clamp01(smoothed) * 100),
    evidenceCoverage: round4(activeSignalCategories.length / ALL_SIGNAL_CATEGORIES.length),
    activeSignalCategories,
    breakdown,
    evidence,
  };
}

export function scoreMeetingState(
  state: Pick<
    MeetingRuntimeState,
    'metadata' | 'participants' | 'participantOrder' | 'processedEvents' | 'transcriptEventCount' | 'previousSmoothedScores'
  >,
): CandidateDecision {
  const scores = state.participantOrder.map((id) =>
    scoreParticipant(
      state.metadata,
      state.participants[id],
      state.transcriptEventCount,
      state.previousSmoothedScores[id],
    ),
  );

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  // Only participants who actually joined can be selected as the candidate.
  const joinedSorted = sorted.filter((s) => state.participants[s.participantId]?.joined);
  const top = joinedSorted[0];
  const second = joinedSorted[1];
  const margin = top ? round4(top.score - (second?.score ?? 0)) : 0;

  // Useful-evidence rule: the current leader must have real evidence behind
  // them (identity/email/transcript, or two distinct non-media categories)
  // before any decision is attempted. Joins and webcam toggles alone are not
  // enough — no matter how many of them there are.
  const topEligible =
    top !== undefined &&
    isEligibleForDecision(state.participants[top.participantId], top.activeSignalCategories);

  let status: CandidateDecision['status'];
  let selectedParticipantId: CandidateDecision['selectedParticipantId'];

  if (!top || !topEligible) {
    status = 'insufficient_data';
    selectedParticipantId = null;
  } else if (top.score >= SELECTION_THRESHOLD && margin >= MARGIN_THRESHOLD) {
    status = 'selected';
    selectedParticipantId = top.participantId;
  } else {
    status = 'uncertain';
    selectedParticipantId = null;
  }

  return {
    selectedParticipantId,
    status,
    candidateScore: top ? top.score : 0,
    evidenceCoverage: top ? top.evidenceCoverage : 0,
    marginToRunnerUp: margin,
    runnerUpParticipantId: second?.participantId ?? null,
    explanation: buildExplanation(status, top, second, margin),
    scores: sorted,
  };
}

/** Human-readable label for an evidence-coverage fraction. */
export function coverageLabel(coverage: number): 'Low' | 'Medium' | 'High' {
  if (coverage >= 0.6) return 'High';
  if (coverage >= 0.35) return 'Medium';
  return 'Low';
}

function coveragePhrase(top: ParticipantScore): string {
  return `${coverageLabel(top.evidenceCoverage).toLowerCase()} (${top.activeSignalCategories.length} of ${ALL_SIGNAL_CATEGORIES.length} signal categories active)`;
}

function buildExplanation(
  status: CandidateDecision['status'],
  top: ParticipantScore | undefined,
  second: ParticipantScore | undefined,
  margin: number,
): string {
  if (status === 'insufficient_data' || !top) {
    return 'Insufficient data. Waiting for useful identity, email, or transcript evidence — generic events such as joins and webcam changes are not enough to decide on. No participant is selected yet.';
  }

  const marginPoints = Math.round(margin * 100);

  if (status === 'selected') {
    const positives = top.evidence
      .filter((e) => e.direction === 'positive')
      .slice(0, 3)
      .map((e) => stripTrailingPeriod(lowercaseFirst(e.message)));
    const support = positives.length > 0 ? ` The decision is supported by: ${positives.join('; ')}.` : '';
    const marginNote = second
      ? ` The lead is ${marginPoints >= 20 ? 'comfortable' : 'adequate'}: "${top.displayName}" is ${marginPoints} points ahead of the next best participant ("${second.displayName}").`
      : '';
    return `Selected "${top.displayName}" as the likely candidate. Candidate score: ${top.scorePercent}% (evidence-based, not a calibrated probability) with ${coveragePhrase(top)} evidence coverage.${support}${marginNote}`;
  }

  // Uncertain
  if (second && margin < MARGIN_THRESHOLD) {
    return `Candidate uncertain because the margin is too low. "${top.displayName}" (score ${top.scorePercent}%) and "${second.displayName}" (score ${second.scorePercent}%) both have plausible evidence, but the margin is only ${marginPoints} points — below the safe selection threshold. Evidence coverage for the leader is ${coveragePhrase(top)}. The system needs more transcript or verified identity evidence before selecting a participant.`;
  }
  return `Candidate uncertain because the score is too low. The top participant "${top.displayName}" has a candidate score of ${top.scorePercent}%, below the ${Math.round(SELECTION_THRESHOLD * 100)}% selection threshold. Evidence coverage is ${coveragePhrase(top)}. The system needs more evidence before selecting a participant.`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function lowercaseFirst(text: string): string {
  return text.length === 0 ? text : text[0].toLowerCase() + text.slice(1);
}

function stripTrailingPeriod(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}
