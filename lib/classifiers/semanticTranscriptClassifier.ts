import type {
  TranscriptRole,
  TranscriptRoleClassifier,
  TranscriptRoleResult,
} from '../transcriptRoleClassifier';
import type { TranscriptAnalysis } from '../types';

/**
 * Offline semantic transcript role classifier.
 *
 * Example-bank nearest-neighbor classification: each utterance is compared
 * (cosine similarity over a normalized bag-of-words) against small banks of
 * labeled candidate / interviewer / neutral example utterances. This catches
 * paraphrases the phrase rules miss ("at my last gig we shipped a payments
 * thing" has no textbook phrase but is clearly candidate-like) while staying
 * deterministic, dependency-free, and explainable — every classification
 * names the example it was closest to.
 *
 * This is intentionally an offline approximation of the production path
 * (embedding model or LLM behind the same interface), not production-grade
 * ML — see docs/evaluation.md § AI/ML Evaluation Notes.
 */

export const CANDIDATE_EXAMPLES = [
  'I built a fraud detection dashboard using React and TypeScript.',
  'In my internship, I worked on backend APIs.',
  'My final year project was about computer vision.',
  'I am currently studying computer science.',
  'I used Supabase and Next.js in my project.',
  'My name is Ananya and I am in my final year of engineering.',
  'I handled the deployment and wrote the integration tests myself.',
  'At my last company we shipped a payments feature and I owned the backend service.',
  'I would approach it by caching the results and adding a database index.',
  'I learned Docker while building a side project last semester.',
  'My strengths are problem solving and writing clean, tested code.',
  'I interned at a startup where I fixed production bugs in the checkout flow.',
];

export const INTERVIEWER_EXAMPLES = [
  'Can you introduce yourself?',
  'Tell me about your project.',
  'What are your strengths and weaknesses?',
  'Can you explain your approach?',
  'Why should we hire you?',
  'Walk me through your resume and your recent experience.',
  'How would you design a rate limiter for our API?',
  "Let's move on to the next question.",
  'Do you have any questions for us about the team or the role?',
  'Thanks for joining, we will start with a short introduction of the panel.',
  'Could you share your screen and show us the code?',
  'What did you find most challenging about that work?',
];

export const NEUTRAL_EXAMPLES = [
  'Sure, give me one second.',
  'Can everyone hear me clearly?',
  'The audio is breaking up a little.',
  'Okay, sounds good.',
  'Sorry, my connection dropped for a moment.',
  'Yes, that works for me.',
  'The weather has been terrible here today.',
  'Alright, no problem at all.',
];

/** Function words that carry no role information. Pronouns are deliberately KEPT — "I/my" vs "you/your" is one of the strongest role signals available. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'that', 'this', 'for', 'with', 'as',
  'by', 'so', 'but', 'have', 'has', 'had', 'do', 'did', 'does',
]);

/** Below this best-bank similarity the utterance is treated as neutral. */
const MIN_SIMILARITY = 0.2;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

type Vector = Map<string, number>;

function toVector(tokens: string[]): Vector {
  const vector: Vector = new Map();
  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  for (const [token, count] of a) {
    const other = b.get(token);
    if (other !== undefined) dot += count * other;
  }
  if (dot === 0) return 0;
  const norm = (v: Vector) =>
    Math.sqrt([...v.values()].reduce((sum, count) => sum + count * count, 0));
  return dot / (norm(a) * norm(b));
}

interface ExampleBank {
  role: TranscriptRole;
  examples: { text: string; vector: Vector }[];
}

const BANKS: ExampleBank[] = [
  { role: 'candidate', examples: CANDIDATE_EXAMPLES.map((t) => ({ text: t, vector: toVector(tokenize(t)) })) },
  { role: 'interviewer', examples: INTERVIEWER_EXAMPLES.map((t) => ({ text: t, vector: toVector(tokenize(t)) })) },
  { role: 'neutral', examples: NEUTRAL_EXAMPLES.map((t) => ({ text: t, vector: toVector(tokenize(t)) })) },
];

interface BankMatch {
  role: TranscriptRole;
  similarity: number;
  closestExample: string;
}

function matchBanks(vector: Vector): BankMatch[] {
  return BANKS.map((bank) => {
    let best = 0;
    let closestExample = bank.examples[0].text;
    for (const example of bank.examples) {
      const similarity = cosineSimilarity(vector, example.vector);
      if (similarity > best) {
        best = similarity;
        closestExample = example.text;
      }
    }
    return { role: bank.role, similarity: best, closestExample };
  });
}

function truncateExample(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function clamp(value: number, min = 0.05, max = 0.95): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Classifies one utterance by similarity to the example banks.
 * Synchronous and fully deterministic.
 */
export function classifyWithSemanticSimilarity(text: string): TranscriptRoleResult {
  const vector = toVector(tokenize(text));
  const matches = matchBanks(vector);
  const ranked = [...matches].sort((a, b) => b.similarity - a.similarity);
  const top = ranked[0];
  const runnerUp = ranked[1];

  const candidateSim = matches.find((m) => m.role === 'candidate')!.similarity;
  const interviewerSim = matches.find((m) => m.role === 'interviewer')!.similarity;

  // Independent likelihoods for the scorer: 0.4 is the "no evidence" baseline,
  // pushed apart by how much closer the utterance sits to one bank than the other.
  const analysis: TranscriptAnalysis = {
    candidateLikelihood: clamp(0.4 + 0.8 * (candidateSim - interviewerSim)),
    interviewerLikelihood: clamp(0.4 + 0.8 * (interviewerSim - candidateSim)),
    matchedCandidatePatterns: [],
    matchedInterviewerPatterns: [],
    summary: '',
    method: 'semantic',
  };

  let role: TranscriptRole;
  let score: number;
  const reasons: string[] = [];

  if (top.similarity < MIN_SIMILARITY) {
    role = 'neutral';
    score = 0.5;
    reasons.push('Not similar enough to any candidate or interviewer example — treated as neutral.');
  } else {
    role = top.role;
    const margin = top.similarity - runnerUp.similarity;
    score = clamp(0.4 + 0.4 * top.similarity + 0.4 * margin, 0.3, 0.9);
    reasons.push(
      `Semantically closest to ${top.role} example: "${truncateExample(top.closestExample)}" (similarity ${top.similarity.toFixed(2)})`,
    );
    if (margin < 0.08 && runnerUp.role !== role) {
      reasons.push(
        `Nearly as close to a ${runnerUp.role} example (similarity ${runnerUp.similarity.toFixed(2)}) — confidence reduced.`,
      );
    }
  }

  analysis.summary = reasons[0];
  analysis.reasons = reasons;

  return { role, score, reasons, method: 'semantic', analysis };
}

export const semanticClassifier: TranscriptRoleClassifier = {
  classifyUtterance: classifyWithSemanticSimilarity,
};
