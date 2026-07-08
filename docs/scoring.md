# Scoring Reference

Full detail on how a participant's **candidate score** is computed. The README keeps only the high-level view; this is the implementation contract. All constants live in `lib/constants.ts`; all scoring logic in `lib/scorer.ts`.

> Terminology: the candidate score is an **evidence-based score, not a calibrated probability**. Weights and thresholds are hand-tuned by reasoning and scenario iteration, not fitted to labeled data.

## Signal weights

Weights sum to 1.0, so the weighted sum is already normalized to 0..1. Neutral (no information) is **0.4, never zero** — missing data must not read as evidence against a participant.

| Signal | Weight | What it captures |
|---|---:|---|
| Name match | 0.18 | Tiered comparison of display name (and name history) vs candidate name — exact (1.0), strong token overlap (0.85), fuzzy/typo (0.8), token + initial i.e. nicknames (0.65), shared token (0.5), weak (0.45), none (0.1). Device names ("MacBook Pro", "Guest") score 0.15 with explicit "not ruled out" evidence. The email local-part can rescue a weak name match up to 0.65. |
| Transcript role | 0.18 | Deterministic per-utterance classification: first-person experience phrases ("I built", "my final year") vs question/instruction phrases ("tell me about", "next question"). Both likelihoods can be non-zero; one phrase can never produce an extreme score. Participant-level score is the utterance average plus a small evidence-count bonus. |
| Interviewer exclusion | 0.16 | Expressed positively: 1.0 = definitely NOT an interviewer. Email match to a known interviewer → 0.02; strong name match → 0.05; host flag → soft −0.15 (never a hard ban — candidates can host test meetings); question-dominant transcript caps it at 0.15; answer-dominant behavior boosts to 0.9. |
| Email match | 0.14 | Exact 1.0 · same local-part 0.75 · same **organization** domain 0.25 · same **public** domain (gmail.com, outlook.com, …) 0.4 neutral — a shared free-mail provider is coincidence, not identity · mismatch 0.1 · not exposed 0.4 neutral. |
| Speaking pattern | 0.14 | Counts answer-style turns vs question-style turns — **not** raw speaking duration, which favors interviewers. Silence becomes a mild negative (0.25) only after the meeting has ≥5 transcript events. |
| Join timing | 0.10 | Within ±5 min of scheduled start 0.8 · 5–15 min late 0.55 · >15 min late 0.35 · >5 min early 0.45 (interviewer-like) · unknown 0.4. |
| Webcam | 0.05 | On 0.6 · off-but-speaking 0.45 · off-and-silent after meeting activity 0.25 · no signal 0.4. |
| Screen share | 0.03 | Shared during candidate-style discussion 0.65 · shared otherwise 0.5 · never 0.4 (not negative — many candidates never share). |
| Consistency | 0.02 | Device-name → candidate-name rename 0.85 · stable evidence across events 0.6 · volatile 0.3 · no history 0.4. |

## Temporal smoothing

`smoothed = 0.65 × previous + 0.35 × raw` — a real-time system that flip-flops on every event is worse than one that converges. The trade-off (smoothing delays correction when late evidence contradicts early evidence) is documented in [limitations.md](limitations.md).

## Evidence coverage

Separately from *how candidate-like* a participant looks, the engine reports *how much usable evidence exists* for them: `evidenceCoverage` = active signal categories / 9. A category is active when it has real data — e.g. `email` requires both a candidate email and an exposed participant email; `speaking` activates on speech **or** on meaningful silence (a joined participant staying quiet through an active meeting); `consistency` activates only after a rename.

UI labels: **Low** < 0.35 ≤ **Medium** < 0.6 ≤ **High**.

## Decision rule

```
eligible          ⇔ joined AND (≥1 strong category active (identity/email/transcript)
                            OR ≥2 distinct non-media categories active)
insufficient_data ⇔ no one joined, OR the current leader is not eligible
selected          ⇔ leader eligible AND score ≥ 0.68 AND margin over runner-up ≥ 0.12
uncertain         ⇔ otherwise
```

The eligibility rule replaces a naive event-count threshold: three generic events (join + webcam on + webcam off) tell you nothing, while a single transcript utterance is genuinely informative. Webcam and screen-share are deliberately excluded from establishing eligibility — media toggles alone must never produce a selection.

Rationale for the dual selection threshold:

- The **absolute bar (0.68)** prevents selecting a weak leader in an information-poor meeting.
- The **margin bar (0.12)** prevents selecting when two participants are close — e.g. "Aman S" at 0.68 vs "A Singh" at 0.66 stays `uncertain` even though the leader clears the absolute bar.
- A wrong confident identification poisons every downstream fraud detector; honest abstention routes to a human instead.

## Output contract

Every update produces a decision that maps 1:1 onto the shape downstream consumers would receive (`CandidateIdentificationResult` in `lib/types.ts`):

```ts
type CandidateIdentificationResult = {
  meetingId: string;
  selectedParticipantId: string | null;
  decision: "insufficient_data" | "uncertain" | "selected";
  candidateScore: number;        // evidence-based, NOT a calibrated probability
  evidenceCoverage: number;      // 0..1 — how much usable evidence backs the leader
  marginToRunnerUp: number;
  runnerUpParticipantId: string | null;
  evidence: EvidenceItem[];      // per-signal, with direction/strength/point impact
  updatedAtEventId: string;
};
```

## Transcript classifier roadmap

The demo classifier is deterministic keyword matching — chosen for reproducible evaluation, zero API keys, and zero latency. It sits behind the `TranscriptRoleClassifier` interface, so upgrades don't touch the scoring engine. The production path, in order:

1. **Deterministic high-precision phrases** (current default) — cheap first pass; keep as the fast path.
2. **Embedding similarity** against a library of labeled candidate/interviewer utterance examples — robust to paraphrase, still cheap per utterance.
3. **LLM classifier for ambiguous utterances** — implemented and demoable today: `lib/transcriptAnalyzer.llm.ts` is a working Claude-backed classifier (structured outputs) behind the same interface, opt-in from the dashboard's Classifier panel with a user-supplied API key. In production it runs selectively (only on utterances the cheaper tiers score as ambiguous) to bound latency and cost — see [production-ingestion.md](production-ingestion.md#5-the-full-llm-in-production).
4. **Multilingual / code-mixed support** — the keyword list is English-only; embeddings and LLMs remove that constraint.
5. **Calibration against labeled meeting data** — fit weights and thresholds on real labeled interviews, and turn the score into a calibrated probability with a held-out validation set.
