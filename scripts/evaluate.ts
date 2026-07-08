/**
 * Runs every scenario start-to-finish and prints an evaluation table:
 * expected vs actual candidate, final confidence, margin, and status.
 *
 * Usage: npm run evaluate
 */
import { scenarios } from '../data/scenarios';
import { runScenarioToEnd } from '../lib/mockMeetingEngine';

interface EvalRow {
  scenario: string;
  expected: string;
  actual: string;
  confidence: string;
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
    confidence: decision.confidence.toFixed(2),
    margin: decision.marginFromSecond.toFixed(2),
    status: decision.status,
    correct,
  };
});

const header = ['Scenario', 'Expected', 'Actual', 'Confidence', 'Margin', 'Status', 'Correct'];
const table = rows.map((r) => [
  r.scenario,
  r.expected,
  r.actual,
  r.confidence,
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
  `\n${correctCount}/${rows.length} scenarios produced the expected outcome ` +
    `(including correct abstention on ambiguous cases).`,
);

const selectedRows = rows.filter((r) => r.status === 'selected' && r.correct);
const avgConfidence =
  selectedRows.reduce((sum, r) => sum + Number(r.confidence), 0) / (selectedRows.length || 1);
console.log(`Average confidence on correct selections: ${avgConfidence.toFixed(2)}`);

if (correctCount !== rows.length) {
  process.exitCode = 1;
}
