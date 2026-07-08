import type { MeetingEvent, ParticipantId, ParticipantRuntimeState } from '@/lib/types';
import { describeEvent, formatEventTime } from '@/lib/utils';

interface EventTimelineProps {
  processedEvents: MeetingEvent[];
  totalEvents: number;
  participants: Record<ParticipantId, ParticipantRuntimeState>;
  colors: Record<ParticipantId, string>;
}

const TYPE_BADGES: Record<MeetingEvent['type'], string> = {
  join: 'bg-sky-500/15 text-sky-400',
  leave: 'bg-slate-600/20 text-slate-400',
  display_name_change: 'bg-violet-500/15 text-violet-400',
  webcam_on: 'bg-emerald-500/15 text-emerald-400',
  webcam_off: 'bg-slate-600/20 text-slate-400',
  screen_share_start: 'bg-cyan-500/15 text-cyan-400',
  screen_share_stop: 'bg-slate-600/20 text-slate-400',
  speech_activity: 'bg-amber-500/15 text-amber-400',
  transcript: 'bg-indigo-500/15 text-indigo-300',
};

export default function EventTimeline({
  processedEvents,
  totalEvents,
  participants,
  colors,
}: EventTimelineProps) {
  const reversed = [...processedEvents].reverse();

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Event Stream</h2>
        <span className="text-[11px] tabular-nums text-slate-500">
          {processedEvents.length} / {totalEvents} events
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-300"
          style={{ width: `${totalEvents === 0 ? 0 : (processedEvents.length / totalEvents) * 100}%` }}
        />
      </div>

      <ol className="mt-3 max-h-105 space-y-2 overflow-y-auto pr-1">
        {reversed.length === 0 && (
          <li className="py-6 text-center text-xs text-slate-600">
            No events yet. Press Play or Step to start the meeting replay.
          </li>
        )}
        {reversed.map((event) => {
          const participant = participants[event.participantId];
          const name = participant?.currentDisplayName ?? event.participantId;
          return (
            <li key={event.id} className="rounded-lg bg-slate-800/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colors[event.participantId] ?? '#64748b' }}
                  />
                  <span className="truncate text-xs font-medium text-slate-200">{name}</span>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                  {formatEventTime(event.timestamp)}
                </span>
              </div>
              <div className="mt-1 flex items-start gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TYPE_BADGES[event.type]}`}>
                  {event.type.replace(/_/g, ' ')}
                </span>
                <p className="text-[11px] leading-snug text-slate-400">{describeEvent(event)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
