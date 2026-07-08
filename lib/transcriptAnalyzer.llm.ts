/**
 * LLM-backed transcript role classifier — the semantic upgrade to the
 * deterministic keyword classifier, behind the same `TranscriptRoleClassifier`
 * interface, so the scoring engine needs zero changes.
 *
 * Wired into the dashboard as an OPT-IN mode: the demo runs fully offline on
 * the deterministic classifier by default; users can paste their own
 * Anthropic API key in the Classifier panel to re-classify a scenario's
 * transcript with Claude. The key lives only in component state (never
 * persisted, never sent anywhere except api.anthropic.com).
 *
 * Uses raw `fetch` (with Anthropic's browser-access header) so the project
 * keeps zero runtime dependencies and works from a static-hosted demo. A
 * server-side production deployment should use the official SDK
 * (`@anthropic-ai/sdk`) and keep the key server-side.
 */
import type { TranscriptAnalysis, TranscriptRoleClassifier } from './types';

const CLASSIFIER_SYSTEM_PROMPT = `You classify utterances from job-interview transcripts.
For each utterance, estimate:
- candidateLikelihood (0..1): how much this sounds like the interview CANDIDATE
  (first-person answers about their own experience, projects, education, skills).
- interviewerLikelihood (0..1): how much this sounds like an INTERVIEWER
  (asking questions, running the meeting, describing the company or the role).
Both can be non-zero — people mix roles within one utterance. Judge the
semantics, not keywords: "at my last gig we shipped a payments thing" is
candidate-like even with no textbook phrases. Be conservative with extreme
scores; short or generic utterances should stay near 0.4/0.4.
Also return a one-sentence summary of your reasoning.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    candidateLikelihood: { type: 'number' },
    interviewerLikelihood: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['candidateLikelihood', 'interviewerLikelihood', 'summary'],
  additionalProperties: false,
} as const;

interface LlmClassification {
  candidateLikelihood: number;
  interviewerLikelihood: number;
  summary: string;
}

export const LLM_CLASSIFIER_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' },
] as const;

export interface LlmClassifierConfig {
  apiKey: string;
  /** Anthropic model id. Defaults to claude-opus-4-8. */
  model?: string;
}

/**
 * Creates a Claude-backed TranscriptRoleClassifier using the Messages API
 * with structured outputs, so the response is guaranteed to be valid JSON
 * matching the schema — no fragile text parsing.
 */
export function createLlmTranscriptClassifier(
  config: LlmClassifierConfig,
): TranscriptRoleClassifier {
  const model = config.model ?? 'claude-opus-4-8';

  return {
    async classify(text: string): Promise<TranscriptAnalysis> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          // Required for direct browser calls; in production the key and the
          // call belong on a server, not in the client.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: CLASSIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Utterance: "${text}"` }],
          output_config: {
            format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Claude API error ${response.status}: ${truncate(body, 200)}`);
      }

      const message = (await response.json()) as {
        stop_reason: string;
        content: Array<{ type: string; text?: string }>;
      };
      if (message.stop_reason === 'refusal') {
        throw new Error('Classification request was refused by the model.');
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
        summary: `LLM (${model}): ${parsed.summary}`,
      };
    },
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
