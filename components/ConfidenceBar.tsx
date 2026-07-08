interface ConfidenceBarProps {
  value: number; // 0..1
  emphasized?: boolean;
}

export default function ConfidenceBar({ value, emphasized = false }: ConfidenceBarProps) {
  const percent = Math.round(value * 100);
  const color =
    value >= 0.68 ? 'bg-emerald-500' : value >= 0.45 ? 'bg-amber-500' : 'bg-slate-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color} ${emphasized ? 'shadow-[0_0_8px_rgba(16,185,129,0.6)]' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`w-10 text-right text-xs tabular-nums ${emphasized ? 'font-semibold text-emerald-400' : 'text-slate-400'}`}>
        {percent}%
      </span>
    </div>
  );
}
