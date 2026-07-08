# Limitations

Honest list of what this prototype does **not** do.

## Data & integration

1. **Mock data only.** All meetings are hand-authored JSON scenarios. No real Google Meet / Zoom / Teams integration; no real audio/video processing. The event schema is production-shaped, but the adapter layer is unbuilt.
2. **Scenario authorship bias.** The same person designed the scenarios and tuned the weights, so the 7/7 evaluation result carries overfitting risk. Real-world accuracy is unknown and would need a labeled calibration set.
3. **Simulated timing.** Events replay on a UI timer, not at true wall-clock intervals; production would need to handle out-of-order events, duplicate webhooks, and clock skew.

## Signals

4. **Keyword transcript classification can be gamed.** A fraudster who knows the phrase lists could speak in interviewer-style patterns; a genuine candidate who asks many questions loses points. Paraphrase, non-English speech, and transcription noise all degrade the signal. (The `TranscriptRoleClassifier` interface exists precisely so an LLM can replace this.)
5. **No audio understanding.** Speaking events carry only duration — no voice continuity, no diarization correction, no prosody. Two people sharing one mic would be attributed as one participant.
6. **No visual understanding.** Webcam state is a boolean; the system can't tell an empty chair from an attentive candidate, and offers no deepfake/liveness signal of its own.
7. **Quiet candidates are hard.** A candidate who barely speaks in a long panel discussion will accumulate silence penalties; the system would likely stay `uncertain` (which is the intended failure mode, but still a miss).
8. **Behavioral priors are cultural/contextual.** Join-timing and host assumptions reflect typical corporate interviews; walk-in setups, test meetings, or candidate-hosted calls weaken them (host is deliberately a soft penalty for this reason).

## Scoring & decisions

9. **Hand-tuned weights and thresholds.** 0.68 selection / 0.12 margin / signal weights were chosen by reasoning and scenario iteration, not calibrated on data. Confidence percentages are *scores*, not calibrated probabilities.
10. **Smoothing delays corrections.** The 0.65/0.35 exponential smoothing that prevents flip-flopping also slows recovery when late evidence contradicts early evidence (e.g. an interviewer impersonating the candidate early on).
11. **Single-candidate assumption.** Panel formats with multiple candidates, back-to-back interview blocks in one meeting, or candidate swaps mid-call (a real fraud vector!) are out of scope — though the abstention machinery would flag the resulting ambiguity.
12. **No online learning.** The system does not update weights from confirmed outcomes; "continues learning as more interview data becomes available" is future work (log signal vectors → human labels → periodic re-fit).

## Engineering

13. **No persistence or multi-meeting state.** Each replay is independent; production would checkpoint runtime state for audit and recovery.
14. **Browser-timer simulation is not a streaming backend.** The engine is pure and portable, but no WebSocket/queue infrastructure was built.
15. **English-only UI and transcripts.**
