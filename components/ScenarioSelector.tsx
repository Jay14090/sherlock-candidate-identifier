import type { MeetingScenario } from '@/lib/types';

interface ScenarioSelectorProps {
  scenarios: MeetingScenario[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function ScenarioSelector({ scenarios, selectedId, onSelect }: ScenarioSelectorProps) {
  const selected = scenarios.find((s) => s.id === selectedId);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Scenario</h2>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
      >
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {selected && <p className="mt-3 text-xs leading-relaxed text-slate-400">{selected.description}</p>}
    </section>
  );
}
