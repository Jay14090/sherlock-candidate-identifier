# Alternatives Considered

The chosen approach is a **deterministic multi-signal scoring engine with optional LLM extension points**, running against simulated real-time meeting events. Here are the roads not taken, and why.

## Alternative A — Display-name-only matching

**Why tempting:** Simple, fast, works for the happy path; most participants do join with their real name.

**Why rejected:** It fails on exactly the cases Sherlock cares about — the candidate joining as `MacBook Pro`, using a nickname, a recruiter typo, or a mid-meeting rename. Fraudsters control their own display name, so any system anchored to it is trivially gamed. In this prototype the name is one signal at 18% weight, and the device-name scenario demonstrates recovery when it's useless.

## Alternative B — Email-only matching

**Why tempting:** Email is a strong identity signal — when it's exactly right, it's nearly conclusive.

**Why rejected:** Meeting platforms frequently don't expose participant emails (especially for guests joining via link), candidates join from personal accounts that differ from the application email, and the metadata email itself can be stale. Email is kept as a high-value signal (14%, and an exact match scores 1.0), but the missing-metadata scenario shows the system working when email never appears on any participant.

## Alternative C — Face recognition first

**Why tempting:** With an enrolled reference photo, biometric matching could strongly identify a known candidate.

**Why rejected:**
- Requires prior enrollment — often unavailable at interview time.
- Biometric data is legally and ethically sensitive (BIPA/GDPR-class consent requirements).
- Fails outright with cameras off, poor lighting, or multiple faces in frame.
- Circular with Sherlock's own problem space: deepfakes defeat naive face matching, so it would need its own liveness stack.
- Most fundamentally, the challenge is *role identification* (which participant is the candidate), not *identity verification* (is this person who they claim). Those need different tools.

**Where it fits later:** consented visual embeddings / liveness as one more weak signal feeding the same engine — never the sole identifier.

## Alternative D — LLM-only reasoning

**Why tempting:** An LLM reading the transcript and roster could reason about roles semantically, handle paraphrase, and even explain itself.

**Why rejected for the core:**
- Non-deterministic — evaluation numbers would wobble run to run, and regressions would be hard to pin down.
- API key + network dependency breaks the "reviewer runs it offline in two commands" requirement.
- Cost and latency per event are poor fits for a per-utterance real-time loop.
- Confidence calibration is opaque; an LLM saying "90% sure" is not a calibrated probability, while a weighted evidence sum is inspectable point by point.

**Where it fits later:** the `TranscriptRoleClassifier` interface in `lib/transcriptRoleClassifier.ts` is exactly the seam — swap the offline hybrid (rules + example-bank similarity) for an LLM with structured outputs to classify utterance roles, keep the scoring engine unchanged (an opt-in Claude classifier already sits behind it in `lib/classifiers/llmTranscriptClassifier.ts`). Best of both: semantic robustness inside, deterministic aggregation outside.

## Alternative E — Real Google Meet / Zoom / Teams integration

**Why tempting:** Production-shaped; impressive on the surface.

**Why rejected for the prototype:** OAuth flows, bot-join permissions, per-platform event APIs, and browser-extension plumbing would consume most of the build time while demonstrating nothing about the actual hard problem — reasoning about who the candidate is. Worse, live integration makes the hard edge cases (renames, typos, twins) nearly impossible to demo on demand. Controlled scenario replay makes every edge case reproducible in seconds.

**Mitigation:** the event schema and reducer were designed adapter-first — `MeetingEvent` is what a platform webhook/bot would emit, and the engine consumes events one at a time with no knowledge of their origin. A real adapter slots in without touching scoring.

## Alternative F — Learned model instead of hand-tuned weights

**Why tempting:** A logistic regression / gradient-boosted ranker over the same signals would learn optimal weights and calibrated probabilities.

**Why rejected for now:** No labeled training data exists at prototype time, and hand-tuned weights with visible evidence are more explainable to reviewers. The signal extraction layer is exactly the feature engineering a learned ranker would need — the upgrade path is to log signal vectors + human-confirmed labels from production, then fit and calibrate.

## Final decision

> A deterministic multi-signal scoring engine with explicit evidence, honest abstention, and clean extension seams for LLM classification, learned ranking, and real platform adapters.
