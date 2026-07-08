import type { CandidateDecision, EvidenceItem } from '@/lib/types';

interface ExplanationPanelProps {
  decision: CandidateDecision;
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const tone =
    item.direction === 'positive'
      ? 'text-emerald-400'
      : item.direction === 'negative'
        ? 'text-rose-400'
        : 'text-slate-500';
  const symbol = item.direction === 'positive' ? '+' : item.direction === 'negative' ? '−' : '0';
  const impact = item.weightImpact;

  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 w-3 shrink-0 text-center font-bold ${tone}`}>{symbol}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug text-slate-300">{item.message}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-600">
          {item.signal} · {item.strength} {item.direction} ·{' '}
          <span className="tabular-nums">
            {impact >= 0 ? '+' : ''}
            {(impact * 100).toFixed(1)} pts
          </span>
        </p>
      </div>
    </li>
  );
}

export default function ExplanationPanel({ decision }: ExplanationPanelProps) {
  const top = decision.scores[0];
  const runnerUp = decision.scores[1];

  const borderTone =
    decision.status === 'selected'
      ? 'border-emerald-500/40'
      : decision.status === 'uncertain'
        ? 'border-amber-500/40'
        : 'border-slate-800';

  return (
    <section className={`rounded-xl border bg-slate-900 p-4 ${borderTone}`}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Why the system thinks this
      </h2>
      <p className="text-sm leading-relaxed text-slate-200">{decision.explanation}</p>

      {top && (
        <div className="mt-4">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Evidence for top participant — {top.displayName} ({top.confidencePercent}%)
          </h3>
          <ul className="divide-y divide-slate-800/60">
            {top.evidence.map((item, i) => (
              <EvidenceRow key={i} item={item} />
            ))}
          </ul>
        </div>
      )}

      {decision.status === 'uncertain' && runnerUp && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-500/90">
            Competing evidence — {runnerUp.displayName} ({runnerUp.confidencePercent}%)
          </h3>
          <ul className="divide-y divide-slate-800/60">
            {runnerUp.evidence
              .filter((e) => e.direction === 'positive')
              .slice(0, 4)
              .map((item, i) => (
                <EvidenceRow key={i} item={item} />
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
