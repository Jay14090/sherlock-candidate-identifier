'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CandidateMetadataPanel from '@/components/CandidateMetadataPanel';
import ClassifierPanel, { type ClassifierMode, type LlmStatus } from '@/components/ClassifierPanel';
import ScoreHistoryChart from '@/components/ScoreHistoryChart';
import EventTimeline from '@/components/EventTimeline';
import ExplanationPanel from '@/components/ExplanationPanel';
import ParticipantCard from '@/components/ParticipantCard';
import ReplayControls from '@/components/ReplayControls';
import ScenarioSelector from '@/components/ScenarioSelector';
import SystemSummary from '@/components/SystemSummary';
import { scenarios } from '@/data/scenarios';
import {
  classifyTranscriptEvents,
  createRuntimeState,
  isFinished,
  stepForward,
} from '@/lib/mockMeetingEngine';
import { createLlmTranscriptClassifier } from '@/lib/classifiers/llmTranscriptClassifier';
import type { ParticipantId, TranscriptAnalysis } from '@/lib/types';
import { statusLabel } from '@/lib/utils';

const BASE_INTERVAL_MS = 1500;

const PARTICIPANT_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185'];

const STATUS_STYLES = {
  selected: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  uncertain: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  insufficient_data: 'bg-slate-700/40 text-slate-400 border-slate-600/50',
} as const;

export default function Home() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? scenarios[0],
    [scenarioId],
  );

  const [state, setState] = useState(() => createRuntimeState(scenario));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Optional LLM classification (opt-in; offline hybrid rules + semantic by default).
  const [classifierMode, setClassifierMode] = useState<ClassifierMode>('hybrid');
  const [apiKey, setApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('claude-opus-4-8');
  const [llmStatus, setLlmStatus] = useState<LlmStatus>('idle');
  const [llmProgress, setLlmProgress] = useState({ done: 0, total: 0 });
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmAnalyses, setLlmAnalyses] = useState<Record<string, TranscriptAnalysis> | null>(null);

  const activeAnalyses =
    classifierMode === 'llm' && llmStatus === 'ready' && llmAnalyses ? llmAnalyses : undefined;

  const finished = isFinished(state);
  // Derived, not synced: when the replay runs out of events the interval
  // stops on its own and the controls fall back to their idle appearance.
  const effectivePlaying = playing && !finished;

  const colors = useMemo(() => {
    const map: Record<ParticipantId, string> = {};
    state.participantOrder.forEach((id, i) => {
      map[id] = PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length];
    });
    return map;
  }, [state.participantOrder]);

  const reset = useCallback((id: string) => {
    const next = scenarios.find((s) => s.id === id) ?? scenarios[0];
    setState(createRuntimeState(next));
    setPlaying(false);
  }, []);

  const handleScenarioChange = (id: string) => {
    setScenarioId(id);
    reset(id);
    // LLM analyses are per-scenario; a new scenario needs a fresh run.
    setLlmAnalyses(null);
    setLlmStatus('idle');
    setLlmError(null);
  };

  const runLlmClassification = useCallback(async () => {
    setLlmStatus('classifying');
    setLlmError(null);
    try {
      const classifier = createLlmTranscriptClassifier({ apiKey, model: llmModel });
      const analyses = await classifyTranscriptEvents(scenario.events, classifier, (done, total) =>
        setLlmProgress({ done, total }),
      );
      setLlmAnalyses(analyses);
      setLlmStatus('ready');
      reset(scenario.id); // replay from the start with LLM analyses applied
    } catch (error) {
      setLlmAnalyses(null);
      setLlmStatus('error');
      setLlmError(error instanceof Error ? error.message : 'Classification failed');
    }
  }, [apiKey, llmModel, scenario, reset]);

  useEffect(() => {
    if (!effectivePlaying) return;
    const interval = setInterval(() => {
      setState((current) => stepForward(current, activeAnalyses));
    }, BASE_INTERVAL_MS / speed);
    return () => clearInterval(interval);
  }, [effectivePlaying, speed, activeAnalyses]);

  const { decision } = state;
  const scoreByParticipant = useMemo(
    () => new Map(decision.scores.map((s) => [s.participantId, s])),
    [decision],
  );

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Sherlock <span className="text-sky-400">Candidate Identifier</span>
            </h1>
            <p className="text-[11px] text-slate-500">
              Real-time multi-signal identification of the interview candidate · {scenario.name}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[decision.status]}`}
            title="Candidate score is an evidence-based score, not a calibrated probability."
          >
            {statusLabel(decision.status)}
            {decision.status === 'selected' &&
              ` · score ${Math.round(decision.candidateScore * 100)}%`}
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* Left rail */}
        <div className="space-y-4">
          <ScenarioSelector
            scenarios={scenarios}
            selectedId={scenarioId}
            onSelect={handleScenarioChange}
          />
          <ClassifierPanel
            mode={classifierMode}
            onModeChange={setClassifierMode}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            model={llmModel}
            onModelChange={setLlmModel}
            status={llmStatus}
            progress={llmProgress}
            error={llmError}
            onRun={runLlmClassification}
          />
          <CandidateMetadataPanel metadata={scenario.metadata} />
          <SystemSummary decision={decision} />
        </div>

        {/* Center column */}
        <div className="min-w-0 space-y-4">
          <ReplayControls
            playing={effectivePlaying}
            finished={finished}
            speed={speed}
            onPlayPause={() => setPlaying((p) => !p)}
            onStep={() => setState((current) => stepForward(current, activeAnalyses))}
            onReset={() => reset(scenarioId)}
            onSpeedChange={setSpeed}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {state.participantOrder.map((id) => {
              const runtime = state.participants[id];
              const score = scoreByParticipant.get(id);
              if (!score) return null;
              return (
                <ParticipantCard
                  key={id}
                  runtime={runtime}
                  score={score}
                  isSelected={decision.selectedParticipantId === id}
                  color={colors[id]}
                />
              );
            })}
          </div>

          <ScoreHistoryChart
            history={state.scoreHistory}
            participantOrder={state.participantOrder}
            participants={state.participants}
            colors={colors}
          />

          <ExplanationPanel decision={decision} />
        </div>

        {/* Right rail */}
        <div className="min-w-0 lg:col-span-2 xl:col-span-1">
          <EventTimeline
            processedEvents={state.processedEvents}
            totalEvents={state.allEvents.length}
            participants={state.participants}
            colors={colors}
          />
        </div>
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-center text-[11px] text-slate-600 sm:px-6">
        Simulated meeting replay — the scoring engine consumes the same event shapes a real
        Meet/Zoom/Teams adapter would emit. Built for the Sherlock Internship Challenge.
      </footer>
    </main>
  );
}
