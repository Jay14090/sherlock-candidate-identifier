# Limitations

An honest account of what this prototype does not do. Framing note: the evaluation should be interpreted as **controlled behavioral validation, not a real-world benchmark**.

## Data & integration

1. **Mock data only.** All meetings are hand-authored JSON scenarios. No live Google Meet / Zoom / Teams integration; no real audio/video processing. The event schema is production-shaped, but the adapter layer is unbuilt.
2. **Evaluation circularity.** The scenarios were authored alongside the weight tuning, so the 7/7 pass rate carries selection bias. Real-world accuracy is unknown and would require a labeled calibration set.
3. **Simulated timing.** Events replay on a UI timer, not at true wall-clock intervals; production would need to handle out-of-order events, duplicate webhooks, and clock skew.

## Signals

4. **Transcript role classification is intentionally simple in the offline demo** and should be replaced by a semantic classifier in production. Keyword matching is vulnerable to paraphrase, transcription noise, and deliberate evasion, and is English-only. The `TranscriptRoleClassifier` interface and the staged upgrade path (embeddings → selective LLM → multilingual → calibration) exist for exactly this reason — see [scoring.md](scoring.md#transcript-classifier-roadmap).
5. **No audio understanding.** Speaking events carry only duration — no voice continuity, no diarization correction, no prosody. Two people sharing one microphone are attributed as one participant.
6. **No visual understanding.** Webcam state is a boolean; the system cannot distinguish an empty chair from an attentive candidate, and offers no deepfake/liveness signal of its own.
7. **Quiet candidates are hard.** A candidate who barely speaks in a long panel discussion accumulates silence penalties; the system would likely stay `uncertain` — the intended failure mode, but still an unresolved meeting.
8. **Behavioral priors are cultural and contextual.** Join-timing and host assumptions reflect typical corporate interviews; candidate-hosted calls or informal setups weaken them (host is deliberately a soft penalty for this reason).

## Scoring & decisions

9. **Hand-tuned weights and thresholds.** The 0.68 selection / 0.12 margin thresholds and signal weights were chosen by reasoning and scenario iteration, not calibrated on data. **Candidate scores are evidence-based scores, not calibrated probabilities** — the UI and docs label them accordingly.
10. **Smoothing delays corrections.** The 0.65/0.35 exponential smoothing that prevents flip-flopping also slows recovery when late evidence contradicts early evidence.
11. **Single-candidate assumption.** Panel formats with multiple candidates or back-to-back interview blocks in one meeting are out of scope — though the abstention machinery would flag the resulting ambiguity.
12. **No online learning.** The system does not update weights from confirmed outcomes; the production path is to log signal vectors, collect human labels, and periodically re-fit.

## Engineering

13. **No persistence or multi-meeting state.** Each replay is independent; production would checkpoint runtime state for audit and recovery.
14. **Browser-timer simulation is not a streaming backend.** The engine is pure and portable, but no WebSocket/queue infrastructure was built.
15. **English-only UI and transcripts.**

---

## Adversarial Cases Not Fully Solved

The current design assumes participants are not actively gaming the identifier. These cases are documented rather than solved:

| Adversarial case | Current behavior | Gap |
|---|---|---|
| **Interviewer maliciously renames themselves to the candidate's name** | Interviewer email/name-history matching and question-style transcript penalties push back; the name history records the rename | If the interviewer's email isn't exposed and they also mimic answer-style speech, the name signal is polluted; margin logic would likely force `uncertain`, but selection of the impostor is not impossible |
| **Candidate joins from two devices** | Both devices accumulate the candidate's identity evidence; margin threshold likely forces `uncertain` | No device-merging logic; the "candidate" is really two participant IDs |
| **Candidate is silent while someone else answers** (proxy interview) | The answering participant scores highest — which is *correct* for fraud detection (their media should be analyzed) but the identity mismatch is not flagged as suspicious per se | No explicit identity-vs-behavior contradiction alarm |
| **Mid-call person swap** | Temporal smoothing actively works against fast detection; consistency signal drops slowly | Needs voice/face continuity signals (diarization, embeddings) that the prototype does not have |
| **Wrong speaker attribution in the transcript** | Garbage in, garbage out — role classification is credited to the wrong participant | No attribution-confidence input or cross-checking against speech-activity events |
| **Non-English or code-mixed interview** | Keyword classifier produces neutral scores; decisions fall back to identity + behavior signals | Transcript signal is effectively disabled; overall evidence coverage drops |
| **Observer shares the candidate's first name** | Shared-token tier gives them 0.5 name score, not a strong match; behavior signals separate them | In a sparse meeting (little speech), the margin could narrow enough to abstain unnecessarily |
| **Multiple candidates in one meeting** | Single-candidate assumption; the margin rule forces `uncertain` between them | No top-N selection with per-slot margins |

### Mitigations in the current design

- **Margin threshold** — near-ties never produce a selection.
- **Abstention as a first-class outcome** — `uncertain` is a designed state with its own UI and explanation, not a failure.
- **Name-history tracking** — renames are recorded and surfaced as evidence, so a suspicious rename is at least visible.
- **Multiple-likely-candidate visibility** — the uncertain state displays competing evidence for both plausible participants.
- **Human review fallback** — the intended production route for every `uncertain` decision.
- **Separation of concerns** — candidate-identification confidence is deliberately separate from fraud-risk confidence; a confidently identified candidate can still be a fraud risk, and an uncertain identification is itself a weak fraud signal.
- **Audit/replay logs** — the runtime state and per-event evidence serialize, so any decision can be reconstructed and reviewed after the fact.

### Mitigations that need new signals

Sudden identity-shift detection (rename + voice change in a short window), voice-continuity embeddings, consented face-presence checks, and transcript-attribution confidence would close most of the table above — they are listed in the README's future improvements and would feed the same evidence framework.
