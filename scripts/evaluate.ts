/**
 * Runs every scenario start-to-finish and prints an evaluation table:
 * expected vs actual candidate, final candidate score, evidence coverage,
 * margin, and status.
 *
 * Note: candidate score is an evidence-based score, not a calibrated
 * probability, and this is controlled behavioral validation on synthetic
 * scenarios — not a real-world accuracy benchmark.
 *
 * Usage: npm run evaluate
 */
import { scenarios } from '../data/scenarios';
import { runScenarioToEnd } from '../lib/mockMeetingEngine';

interface EvalRow {
  scenario: string;
  expected: string;
  actual: string;
  candidateScore: string;
  coverage: string;
  margin: string;
  status: string;
  correct: boolean;
}

const rows: EvalRow[] = scenarios.map((scenario) => {
  const finalState = runScenarioToEnd(scenario);
  const { decision } = finalState;
  const expected = scenario.expectedCandidateParticipantId ?? 'none (abstain)';
  const actual = decision.selectedParticipantId ?? 'none (abstained)';
  const correct =
    scenario.expectedCandidateParticipantId === null
      ? decision.selectedParticipantId === null
      : decision.selectedParticipantId === scenario.expectedCandidateParticipantId;

  return {
    scenario: scenario.id,
    expected,
    actual,
    candidateScore: decision.candidateScore.toFixed(2),
    coverage: decision.evidenceCoverage.toFixed(2),
    margin: decision.marginToRunnerUp.toFixed(2),
    status: decision.status,
    correct,
  };
});

const header = [
  'Scenario',
  'Expected',
  'Actual',
  'Candidate score',
  'Coverage',
  'Margin',
  'Status',
  'Pass',
];
const table = rows.map((r) => [
  r.scenario,
  r.expected,
  r.actual,
  r.candidateScore,
  r.coverage,
  r.margin,
  r.status,
  r.correct ? 'YES' : 'NO',
]);

const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');

console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(line(row));

const correctCount = rows.filter((r) => r.correct).length;
console.log(
  `\nSynthetic scenario pass rate: ${correctCount}/${rows.length} ` +
    `(including correct abstention on ambiguous cases).`,
);

const selectedRows = rows.filter((r) => r.status === 'selected' && r.correct);
const avgScore =
  selectedRows.reduce((sum, r) => sum + Number(r.candidateScore), 0) / (selectedRows.length || 1);
console.log(`Average candidate score on correct selections: ${avgScore.toFixed(2)}`);
console.log(
  'Note: controlled behavioral validation on synthetic scenarios — not a real-world accuracy benchmark.',
);

if (correctCount !== rows.length) {
  process.exitCode = 1;
}
