import { SELECTION_THRESHOLD } from '@/lib/constants';
import type { ConfidenceHistoryEntry, ParticipantId, ParticipantRuntimeState } from '@/lib/types';

interface ConfidenceHistoryChartProps {
  history: ConfidenceHistoryEntry[];
  participantOrder: ParticipantId[];
  participants: Record<ParticipantId, ParticipantRuntimeState>;
  colors: Record<ParticipantId, string>;
}

const WIDTH = 560;
const HEIGHT = 180;
const PAD_X = 8;
const PAD_Y = 10;

export default function ConfidenceHistoryChart({
  history,
  participantOrder,
  participants,
  colors,
}: ConfidenceHistoryChartProps) {
  const n = history.length;

  const x = (index: number) =>
    n <= 1 ? PAD_X : PAD_X + (index / (n - 1)) * (WIDTH - 2 * PAD_X);
  const y = (score: number) => HEIGHT - PAD_Y - score * (HEIGHT - 2 * PAD_Y);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Confidence Over Time
      </h2>
      {n < 2 ? (
        <p className="py-8 text-center text-xs text-slate-600">
          The confidence timeline appears after a few events are processed.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Participant confidence over time">
            {/* selection threshold */}
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={y(SELECTION_THRESHOLD)}
              y2={y(SELECTION_THRESHOLD)}
              stroke="#10b981"
              strokeOpacity={0.35}
              strokeDasharray="5 5"
            />
            <text x={WIDTH - PAD_X} y={y(SELECTION_THRESHOLD) - 4} textAnchor="end" fontSize={9} fill="#10b981" fillOpacity={0.7}>
              selection threshold {Math.round(SELECTION_THRESHOLD * 100)}%
            </text>
            {/* gridlines */}
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={PAD_X} x2={WIDTH - PAD_X} y1={y(g)} y2={y(g)} stroke="#1e293b" strokeWidth={1} />
            ))}
            {participantOrder.map((id) => {
              const points = history
                .map((entry, i) => `${x(i).toFixed(1)},${y(entry.scores[id] ?? 0).toFixed(1)}`)
                .join(' ');
              return (
                <polyline
                  key={id}
                  points={points}
                  fill="none"
                  stroke={colors[id]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {participantOrder.map((id) => (
              <span key={id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[id] }} />
                {participants[id]?.currentDisplayName ?? id}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
