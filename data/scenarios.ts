import type { MeetingScenario } from '@/lib/types';
import clearMatch from './scenario-clear-match.json';
import deviceName from './scenario-device-name.json';
import nickname from './scenario-nickname.json';
import multipleInterviewers from './scenario-multiple-interviewers-observers.json';
import missingMetadata from './scenario-missing-metadata.json';
import ambiguous from './scenario-ambiguous.json';
import wrongName from './scenario-wrong-name.json';

export const scenarios: MeetingScenario[] = [
  clearMatch,
  deviceName,
  nickname,
  multipleInterviewers,
  missingMetadata,
  ambiguous,
  wrongName,
] as MeetingScenario[];

export function getScenarioById(id: string): MeetingScenario | undefined {
  return scenarios.find((s) => s.id === id);
}

/**
 * Structural validation for scenario files. Returns a list of problems
 * (empty = valid). Run by tests so a broken scenario fails CI, not the demo.
 */
export function validateScenario(scenario: MeetingScenario): string[] {
  const problems: string[] = [];
  const participantIds = new Set(scenario.participants.map((p) => p.id));

  if (!scenario.id) problems.push('Scenario is missing an id.');
  if (!scenario.metadata) problems.push(`Scenario "${scenario.id}" is missing metadata.`);
  if (scenario.participants.length === 0) problems.push(`Scenario "${scenario.id}" has no participants.`);
  if (scenario.events.length === 0) problems.push(`Scenario "${scenario.id}" has no events.`);

  if (
    scenario.expectedCandidateParticipantId !== null &&
    !participantIds.has(scenario.expectedCandidateParticipantId)
  ) {
    problems.push(
      `Scenario "${scenario.id}" expects candidate "${scenario.expectedCandidateParticipantId}" but no such participant exists.`,
    );
  }

  const seenEventIds = new Set<string>();
  for (const event of scenario.events) {
    if (!participantIds.has(event.participantId)) {
      problems.push(`Event "${event.id}" references unknown participant "${event.participantId}".`);
    }
    if (seenEventIds.has(event.id)) {
      problems.push(`Duplicate event id "${event.id}" in scenario "${scenario.id}".`);
    }
    seenEventIds.add(event.id);
    if (Number.isNaN(Date.parse(event.timestamp))) {
      problems.push(`Event "${event.id}" has an unparseable timestamp "${event.timestamp}".`);
    }
    if (event.type === 'transcript' && typeof event.payload.text !== 'string') {
      problems.push(`Transcript event "${event.id}" is missing a text payload.`);
    }
    if (event.type === 'display_name_change' && typeof event.payload.newDisplayName !== 'string') {
      problems.push(`Name-change event "${event.id}" is missing newDisplayName.`);
    }
  }

  const timestamps = scenario.events.map((e) => Date.parse(e.timestamp));
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] < timestamps[i - 1]) {
      problems.push(`Events in scenario "${scenario.id}" are not in chronological order (index ${i}).`);
      break;
    }
  }

  return problems;
}
