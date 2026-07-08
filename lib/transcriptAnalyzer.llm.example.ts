/**
 * EXAMPLE — not wired into the demo.
 *
 * This file shows how a semantic (LLM-backed) transcript role classifier
 * would plug into the engine. The scoring engine consumes the
 * `TranscriptRoleClassifier` interface (see lib/types.ts), so swapping the
 * deterministic keyword classifier for this one requires **zero changes**
 * to the scorer, the reducer, or the UI.
 *
 * The demo intentionally ships with the deterministic classifier instead:
 * reproducible evaluation, no API keys, zero latency, works offline.
 * In production you would use this classifier selectively — e.g. only for
 * utterances the deterministic classifier scores as ambiguous — to keep
 * latency and cost bounded.
 *
 * This example uses raw `fetch` so the demo keeps zero runtime dependencies.
 * A production implementation should use the official SDK instead
 * (`npm install @anthropic-ai/sdk`) for typed responses, automatic retries,
 * and streaming support.
 */
import type { TranscriptAnalysis, TranscriptRoleClassifier } from './types';

const CLASSIFIER_SYSTEM_PROMPT = `You classify utterances from job-interview transcripts.
For each utterance, estimate:
- candidateLikelihood (0..1): how much this sounds like the interview CANDIDATE
  (first-person answers about their own experience, projects, education).
- interviewerLikelihood (0..1): how much this sounds like an INTERVIEWER
  (asking questions, running the meeting, describing the company or role).
Both can be non-zero. Base your judgment on the semantics of the utterance,
not on keywords alone. Be conservative with extreme scores.`;

/** Matches the JSON schema the model is constrained to below. */
interface LlmClassification {
  candidateLikelihood: number;
  interviewerLikelihood: number;
  summary: string;
}

export interface LlmClassifierOptions {
  apiKey: string;
  /** Anthropic model id. */
  model?: string;
}

/**
 * Creates an LLM-backed TranscriptRoleClassifier using the Anthropic
 * Messages API with structured outputs, so the response is guaranteed to be
 * valid JSON matching the schema — no fragile text parsing.
 */
export function createLlmTranscriptClassifier(
  options: LlmClassifierOptions,
): TranscriptRoleClassifier {
  const model = options.model ?? 'claude-opus-4-8';

  return {
    async classify(text: string): Promise<TranscriptAnalysis> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          system: CLASSIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Utterance: "${text}"` }],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: {
                  candidateLikelihood: { type: 'number' },
                  interviewerLikelihood: { type: 'number' },
                  summary: { type: 'string' },
                },
                required: ['candidateLikelihood', 'interviewerLikelihood', 'summary'],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
      }

      const message = (await response.json()) as {
        stop_reason: string;
        content: Array<{ type: string; text?: string }>;
      };
      if (message.stop_reason === 'refusal') {
        throw new Error('Classifier request was refused; fall back to the deterministic classifier.');
      }

      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock?.text) {
        throw new Error('Classifier returned no text content.');
      }
      const parsed = JSON.parse(textBlock.text) as LlmClassification;

      return {
        candidateLikelihood: clamp01(parsed.candidateLikelihood),
        interviewerLikelihood: clamp01(parsed.interviewerLikelihood),
        matchedCandidatePatterns: [],
        matchedInterviewerPatterns: [],
        summary: parsed.summary,
      };
    },
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
