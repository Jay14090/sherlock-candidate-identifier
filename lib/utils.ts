import type { CandidateDecision, MeetingEvent } from './types';

/** "2026-07-08T10:02:12+05:30" -> "10:02:12" in the meeting's own timezone offset. */
export function formatEventTime(timestamp: string): string {
  const match = timestamp.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
  return match ? match[1] : timestamp;
}

export function describeEvent(event: MeetingEvent): string {
  switch (event.type) {
    case 'join':
      return 'joined the meeting';
    case 'leave':
      return 'left the meeting';
    case 'display_name_change':
      return `changed display name to "${String(event.payload.newDisplayName ?? '?')}"`;
    case 'webcam_on':
      return 'turned webcam on';
    case 'webcam_off':
      return 'turned webcam off';
    case 'screen_share_start':
      return 'started sharing screen';
    case 'screen_share_stop':
      return 'stopped sharing screen';
    case 'speech_activity': {
      const seconds = Number(event.payload.durationSeconds ?? 0);
      return `spoke for ${seconds}s (audio activity)`;
    }
    case 'transcript': {
      const text = String(event.payload.text ?? '');
      const preview = text.length > 90 ? `${text.slice(0, 90)}…` : text;
      return `said: "${preview}"`;
    }
  }
}

export function statusLabel(status: CandidateDecision['status']): string {
  switch (status) {
    case 'selected':
      return 'Candidate selected';
    case 'uncertain':
      return 'Candidate uncertain';
    case 'insufficient_data':
      return 'Insufficient data';
  }
}

export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}
