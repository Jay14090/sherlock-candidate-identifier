/**
 * Optional production extension — NOT used by the demo.
 *
 * The demo intentionally does not call an LLM so that evaluation is
 * deterministic, free, and runnable without API keys. The default classifier
 * is the offline hybrid (rules + semantic similarity) in
 * `hybridTranscriptClassifier.ts`; an opt-in, browser-side Claude classifier
 * for interactive exploration lives in `llmTranscriptClassifier.ts`.
 *
 * This file sketches the SERVER-SIDE production shape: the classifier runs
 * behind the same `TranscriptRoleClassifier` interface, so swapping it in
 * changes nothing in the scoring engine. In production, this classifier
 * would call an LLM with a strict JSON schema:
 *
 *   { role: "candidate" | "interviewer" | "neutral", score: number, reasons: string[] }
 *
 * and would additionally need: server-side key management, request batching,
 * a response cache keyed by utterance hash, a latency budget with fallback to
 * the offline hybrid classifier, and calibration against labeled meeting
 * transcripts before its scores are trusted.
 */
import type {
  TranscriptRoleClassifier,
  TranscriptRoleResult,
} from '../transcriptRoleClassifier';
import { classifyHybrid } from './hybridTranscriptClassifier';

// In production (server-side only — never ship a key to the browser):
//
//   import Anthropic from '@anthropic-ai/sdk';
//   const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
//
//   async function classifyWithClaude(text: string): Promise<TranscriptRoleResult> {
//     const message = await client.messages.create({
//       model: 'claude-sonnet-5',
//       max_tokens: 300,
//       system:
//         'Classify the interview-transcript utterance as candidate, interviewer, ' +
//         'or neutral. Respond with JSON: { role, score (0..1), reasons: string[] }.',
//       messages: [{ role: 'user', content: `Utterance: "${text}"` }],
//       output_config: {
//         format: {
//           type: 'json_schema',
//           schema: {
//             type: 'object',
//             properties: {
//               role: { enum: ['candidate', 'interviewer', 'neutral'] },
//               score: { type: 'number' },
//               reasons: { type: 'array', items: { type: 'string' } },
//             },
//             required: ['role', 'score', 'reasons'],
//             additionalProperties: false,
//           },
//         },
//       },
//     });
//     const block = message.content.find((b) => b.type === 'text');
//     return { ...JSON.parse(block.text), method: 'llm' };
//   }

/**
 * Example wiring: LLM-first with a deterministic fallback, so a timeout or
 * API failure degrades to the offline hybrid classifier instead of stalling
 * the real-time pipeline.
 */
export function createProductionLlmClassifierExample(): TranscriptRoleClassifier {
  return {
    async classifyUtterance(text: string): Promise<TranscriptRoleResult> {
      try {
        // return await classifyWithClaude(text);
        throw new Error('LLM call intentionally not implemented in the demo.');
      } catch {
        return classifyHybrid(text);
      }
    },
  };
}
