interface ReplayControlsProps {
  playing: boolean;
  finished: boolean;
  speed: number;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [0.5, 1, 2];

export default function ReplayControls({
  playing,
  finished,
  speed,
  onPlayPause,
  onStep,
  onReset,
  onSpeedChange,
}: ReplayControlsProps) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <button
        onClick={onPlayPause}
        disabled={finished}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        onClick={onStep}
        disabled={finished || playing}
        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-600"
      >
        Step
      </button>
      <button
        onClick={onReset}
        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
      >
        Reset
      </button>
      <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              speed === s ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
      {finished && (
        <span className="w-full text-center text-[11px] text-slate-500 sm:w-auto sm:text-right">
          Replay finished — press Reset to run it again.
        </span>
      )}
    </section>
  );
}
