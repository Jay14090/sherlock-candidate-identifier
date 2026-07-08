import { MARGIN_THRESHOLD, SELECTION_THRESHOLD, SIGNAL_WEIGHTS } from '@/lib/constants';
import type { CandidateDecision } from '@/lib/types';

interface SystemSummaryProps {
  decision: CandidateDecision;
}

const SIGNAL_LABELS: Record<keyof typeof SIGNAL_WEIGHTS, string> = {
  nameMatch: 'Name match',
  emailMatch: 'Email match',
  interviewerExclusion: 'Interviewer exclusion',
  joinTiming: 'Join timing',
  speakingPattern: 'Speaking pattern',
  transcriptCandidateLikelihood: 'Transcript role',
  webcamPresence: 'Webcam presence',
  screenShareBehavior: 'Screen share',
  consistency: 'Consistency',
};

export default function SystemSummary({ decision }: SystemSummaryProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        How Scoring Works
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        Each participant gets a weighted score from nine weak signals. A candidate is only selected
        when the top score reaches {Math.round(SELECTION_THRESHOLD * 100)}% <em>and</em> leads the
        runner-up by {Math.round(MARGIN_THRESHOLD * 100)}+ points — otherwise the system honestly
        reports uncertainty.
      </p>
      <ul className="space-y-1">
        {(Object.keys(SIGNAL_WEIGHTS) as (keyof typeof SIGNAL_WEIGHTS)[]).map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span className="w-36 shrink-0 text-[11px] text-slate-400">{SIGNAL_LABELS[key]}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-slate-500"
                style={{ width: `${SIGNAL_WEIGHTS[key] * 100 * 4}%` }}
              />
            </div>
            <span className="w-8 text-right text-[10px] tabular-nums text-slate-500">
              {Math.round(SIGNAL_WEIGHTS[key] * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
        Current margin over runner-up:{' '}
        <span className="tabular-nums text-slate-300">
          {Math.round(decision.marginFromSecond * 100)} pts
        </span>
      </div>
    </section>
  );
}
