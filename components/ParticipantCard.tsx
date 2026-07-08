import { coverageLabel } from '@/lib/scorer';
import type { ParticipantRuntimeState, ParticipantScore } from '@/lib/types';
import { formatSeconds } from '@/lib/utils';
import ScoreBar from './ScoreBar';

interface ParticipantCardProps {
  runtime: ParticipantRuntimeState;
  score: ParticipantScore;
  isSelected: boolean;
  color: string;
}

function StateChip({ label, tone }: { label: string; tone: 'ok' | 'off' | 'muted' }) {
  const classes =
    tone === 'ok'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : tone === 'off'
        ? 'bg-slate-700/40 text-slate-400 border-slate-600/40'
        : 'bg-slate-800 text-slate-500 border-slate-700/50';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${classes}`}>{label}</span>
  );
}

export default function ParticipantCard({ runtime, score, isSelected, color }: ParticipantCardProps) {
  const topEvidence = score.evidence.filter((e) => e.direction !== 'neutral').slice(0, 3);

  return (
    <article
      className={`rounded-xl border p-4 transition-colors ${
        isSelected
          ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
          : 'border-slate-800 bg-slate-900'
      } ${!runtime.joined ? 'opacity-55' : ''}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="truncate text-sm font-semibold text-slate-100">{runtime.currentDisplayName}</h3>
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {runtime.id}
            {runtime.isHost ? ' · host' : ''}
            {runtime.email ? ` · ${runtime.email}` : ''}
          </p>
        </div>
        {isSelected && (
          <span className="shrink-0 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
            Candidate
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {!runtime.joined && <StateChip label="Not joined" tone="muted" />}
        {runtime.joined && !runtime.leaveTime && <StateChip label="In meeting" tone="ok" />}
        {runtime.leaveTime && <StateChip label="Left" tone="off" />}
        {runtime.webcamOn === true && <StateChip label="Webcam on" tone="ok" />}
        {runtime.webcamOn === false && <StateChip label="Webcam off" tone="off" />}
        {runtime.screenSharing && <StateChip label="Sharing screen" tone="ok" />}
        <StateChip label={`Spoke ${formatSeconds(runtime.totalSpeakingSeconds)}`} tone={runtime.totalSpeakingSeconds > 0 ? 'ok' : 'muted'} />
        <StateChip
          label={`Evidence: ${coverageLabel(score.evidenceCoverage)}`}
          tone={score.evidenceCoverage >= 0.35 ? 'ok' : 'muted'}
        />
      </div>

      <div
        title={`Candidate score ${score.scorePercent}% — an evidence-based score, not a calibrated probability. Evidence coverage: ${score.activeSignalCategories.length}/9 signal categories (${score.activeSignalCategories.join(', ') || 'none'}).`}
      >
        <ScoreBar value={score.score} emphasized={isSelected} />
      </div>

      {runtime.nameHistory.length > 1 && (
        <p className="mt-2 text-[10px] text-sky-400/80">
          Name history: {runtime.nameHistory.join(' → ')}
        </p>
      )}

      {topEvidence.length > 0 && (
        <ul className="mt-3 space-y-1">
          {topEvidence.map((e, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-snug">
              <span
                className={`mt-0.5 shrink-0 font-bold ${
                  e.direction === 'positive' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {e.direction === 'positive' ? '+' : '−'}
              </span>
              <span className="text-slate-400">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
