import { LLM_CLASSIFIER_MODELS } from '@/lib/classifiers/llmTranscriptClassifier';

export type ClassifierMode = 'hybrid' | 'llm';
export type LlmStatus = 'idle' | 'classifying' | 'ready' | 'error';

interface ClassifierPanelProps {
  mode: ClassifierMode;
  onModeChange: (mode: ClassifierMode) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  status: LlmStatus;
  progress: { done: number; total: number };
  error: string | null;
  onRun: () => void;
}

export default function ClassifierPanel({
  mode,
  onModeChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  status,
  progress,
  error,
  onRun,
}: ClassifierPanelProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Transcript Classifier
      </h2>

      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
        <button
          onClick={() => onModeChange('hybrid')}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
            mode === 'hybrid' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Offline hybrid
        </button>
        <button
          onClick={() => onModeChange('llm')}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
            mode === 'llm' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          LLM (Claude)
        </button>
      </div>

      {mode === 'hybrid' && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          High-precision phrase rules + offline semantic similarity against candidate/interviewer
          example utterances — deterministic, reproducible, no API key. This is the default the
          evaluation runs on.
        </p>
      )}

      {mode === 'llm' && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Re-classifies this scenario&apos;s transcript with Claude (full semantic understanding)
            through the same classifier interface. Your key stays in this browser tab and is sent
            only to api.anthropic.com.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Anthropic API key (sk-ant-…)"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500"
          />
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-violet-500"
          >
            {LLM_CLASSIFIER_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={onRun}
            disabled={!apiKey || status === 'classifying'}
            className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {status === 'classifying'
              ? `Classifying… ${progress.done}/${progress.total}`
              : 'Run LLM classification'}
          </button>

          {status === 'ready' && (
            <p className="rounded-lg bg-violet-500/10 px-2.5 py-2 text-[11px] leading-snug text-violet-300">
              {progress.total} utterances classified by Claude. Press Play — the replay now scores
              transcript events with the LLM analyses.
            </p>
          )}
          {status === 'error' && error && (
            <p className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-[11px] leading-snug text-rose-300">
              {error} — the replay falls back to the offline hybrid classifier.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
