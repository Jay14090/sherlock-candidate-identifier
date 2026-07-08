import { describe, expect, it } from 'vitest';
import { scenarios, validateScenario } from '@/data/scenarios';

describe('scenario data integrity', () => {
  it('includes at least six scenarios', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
  });

  it('has unique scenario ids', () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const scenario of scenarios) {
    it(`scenario "${scenario.id}" is structurally valid`, () => {
      expect(validateScenario(scenario)).toEqual([]);
    });
  }

  it('every scenario has a scheduled start time and interviewer list', () => {
    for (const scenario of scenarios) {
      expect(Number.isNaN(Date.parse(scenario.metadata.scheduledStartTime))).toBe(false);
      expect(Array.isArray(scenario.metadata.interviewerNames)).toBe(true);
    }
  });
});
