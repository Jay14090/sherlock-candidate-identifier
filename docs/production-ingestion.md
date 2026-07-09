# Production Ingestion: Getting Live Data from Real Sherlock Calls

The demo replays JSON events. This document answers the harder question in full: **how do you actually get live transcripts, webcam status, join events, and speaking activity out of real Google Meet / Zoom / Teams interviews**, and where does a full LLM fit once you have them.

> API surfaces on these platforms evolve quickly; treat the per-platform details below as a design map to verify at build time, not a frozen spec.

## 1. Constraints that shape the design

1. **Real-time** — the identifier must converge while the interview is running, so downstream fraud detectors can attach to the right participant's streams early. Target: event → updated decision in under ~2 seconds.
2. **Per-participant separation** — the whole point is knowing *who* said/did what. Mixed audio without attribution is nearly useless; per-participant streams or reliable diarization is a hard requirement.
3. **Consent and disclosure** — a bot in the meeting (or recording notice) is visible to participants by design; most jurisdictions require it, and platforms enforce recording indicators.
4. **Graceful degradation** — any signal can be missing on any given call (no transcript, no exposed emails, no video events). The engine already handles this: missing signals stay neutral and evidence coverage drops, which is itself information.

## 2. Data acquisition — the three routes

There are only three realistic ways to get meeting data, in decreasing order of fidelity and increasing order of speed-to-ship:

### Route A — Native platform APIs (highest fidelity, most engineering)

| Platform | Mechanism | What it gives us |
|---|---|---|
| **Zoom** | **Realtime Media Streams (RTMS)** + Meeting SDK bot + event webhooks | RTMS pushes real-time media and transcript data over WebSocket during the meeting. The Meeting SDK (bot joins as a participant with raw-data access) exposes **per-participant audio/video streams**, active-speaker changes, and participant state. Webhooks deliver join/leave, and SDK participant events cover **video on/off**, screen-share start/stop, and display-name changes. Roster carries display names; emails only for authenticated same-account users. |
| **Google Meet** | **Meet Media API** (real-time media over WebRTC, launched via developer preview) + Meet REST API + Add-ons SDK | Media API provides access to real-time audio/video streams for meetings that opt in. The REST API's conference records expose participants and (post-meeting) transcript artifacts — live captions are not generally exposed, so **live transcripts usually mean running our own ASR on the media streams**. Participant join/leave via conference records/events; camera state must often be derived from the video stream itself. |
| **Teams** | **Microsoft Graph communications API** + application-hosted media bots (Real-Time Media Platform) | A registered bot joins the meeting (tenant admin consent) and receives **per-participant audio** (and video with additional setup) in real time. Graph subscriptions deliver roster changes; participant objects carry AAD identity (best-quality email/identity data of the three). Live transcript access is restricted, so again: own ASR on bot-received audio. |

Native APIs are where you end up at scale — best latency, best identity data (especially Teams/AAD), no per-minute vendor margin — but it's three separate engineering efforts with three different consent/review processes (Zoom app review, Google Workspace developer preview enrollment, Azure bot registration + tenant consent).

### Route B — Meeting-bot vendor (fastest to market)

Vendors like **Recall.ai** (or an equivalent meeting-bot-as-a-service) run the bots for you and expose a **single unified API across Meet/Zoom/Teams**: per-participant audio, video frames, screen-share, participant join/leave/rename events, and real-time transcription over a WebSocket. This is the pragmatic phase-1 choice:

- One adapter instead of three; weeks instead of quarters.
- Trade-offs: per-bot-minute cost, a third party inside sensitive interview data (needs DPA/security review), and platform-behavior quirks are abstracted but also out of our control.

### Route C — Interviewer-side capture (last resort / supplement)

A browser extension or desktop app on the **interviewer's** machine taps the meeting tab (WebRTC stats, DOM for roster/camera indicators, tab audio). No bot appears in the meeting, works on any platform — but it's fragile (DOM changes break it), sees only the interviewer's rendered view (mixed audio unless per-tile capture works), and shifts the consent burden. Useful as a fallback when a client forbids bots; not the primary design.

**Recommended rollout: Route B to ship and learn → Route A per-platform as volume justifies it → Route C only for bot-prohibited environments.** All three land on the same internal event schema, which is exactly what the demo's adapter boundary was designed for.

## 3. Mapping raw feeds to the engine's nine signals

| Engine signal | Production source |
|---|---|
| Name match | Roster events (display name + **rename events** — all three platforms emit or expose them) |
| Email match | Zoom (registrant/authenticated email when available) · Teams (AAD identity — strongest) · Meet (Workspace identity for internal users) · calendar invite as the metadata side |
| Interviewer exclusion | ATS/scheduling system (Greenhouse/Lever/calendar) provides interviewer names+emails; host/co-host flags from the platform roster |
| Join timing | Calendar invite (scheduled start) + platform join events |
| Speaking pattern | Active-speaker events from the platform + VAD (voice-activity detection) on per-participant audio for duration/turn counts |
| Transcript role | **Own streaming ASR on per-participant audio** (see §4) — do not depend on platform captions |
| Webcam presence | Zoom SDK video on/off events · Teams media state · Meet: derive from the video stream — a 1 fps sampler flags black/avatar/frozen frames as "camera off" |
| Screen share | Platform share start/stop events (all three expose this) |
| Consistency | Derived internally from the event history (already implemented) |

Metadata (candidate name/email, scheduled time, interviewers) comes from the **scheduling integration** — calendar invite parsing plus the ATS webhook — and is written into the meeting's context before the call starts.

## 4. Live transcript pipeline (the hard 20%)

1. **Prefer per-participant audio** (Zoom SDK raw data, Teams media bot, Recall.ai per-participant tracks). Then attribution is free: one ASR session per participant.
2. **Streaming ASR** — Deepgram/AssemblyAI streaming (or self-hosted Whisper-streaming for data-residency requirements) with word-level timestamps. Consume **final** hypotheses as `transcript` events (~300–800 ms behind speech); interim partials can drive UI but not scoring, to keep decisions stable.
3. **If only mixed audio is available** (worst case): diarization (e.g. pyannote) segments speakers, then map diarized speakers → participants by correlating segment times with the platform's **active-speaker events** — the platform tells you *who* was active when, diarization tells you *what* was said when; the join is the attribution.
4. **Attribution confidence** — carry an `attributionConfidence` on each transcript event; the transcript signal's weight can be discounted by it (directly addresses the "wrong speaker attribution" adversarial case).
5. **Language** — detect language up front; route non-English audio to multilingual ASR and the semantic classifier (keywords are English-only; embeddings/LLM are not).

Webcam status detail (Meet-style platforms without explicit events): sample each participant's video at 1 fps, classify frame as live-camera / avatar-placeholder / black. That's a trivial classifier (mean luminance + variance + face-present-ness), emits `webcam_on`/`webcam_off` events with hysteresis so flicker doesn't spam the engine.

## 5. The full LLM in production

"Use a full LLM" decomposes into **which model, where it runs, and when it's invoked.**

### Which model — three tiers, one interface

All three plug into the existing `TranscriptRoleClassifier` seam:

| Option | Pros | Cons | When |
|---|---|---|---|
| **Hosted frontier LLM (Claude via API)** — implemented in `lib/classifiers/llmTranscriptClassifier.ts`, demoable today from the dashboard's Classifier panel | Best semantic quality immediately; structured outputs guarantee parseable results; zero ML-ops | Per-call cost/latency; interview text leaves the VPC (needs DPA; zero-retention options) | Phase 1 production; the ambiguous-utterance tier |
| **Fine-tuned open-weights model, self-hosted** (e.g. an 8B-class model fine-tuned on labeled interview utterances, served via vLLM) | Data never leaves infra (interviews are sensitive!); ~10–50 ms latency; marginal cost ≈ GPU amortization; can be trained on Sherlock's own labeled corpus | Needs labeled data + ML-ops; quality ceiling below frontier models until tuned | Phase 2, once the human-review loop has produced a few thousand labeled utterances |
| **Embedding similarity** (utterance embedding vs labeled candidate/interviewer example bank) | ~1 ms, ~free, multilingual | Coarser than a generative classifier | The cheap middle tier in the cascade below |

Training a foundation LLM from scratch is **not** on this list deliberately: hundreds of millions of dollars and trillions of tokens to reproduce what an API call or a fine-tune already provides. "Full-fledged LLM" in production means *frontier model where it matters, fine-tuned/self-hosted where data sensitivity and cost matter* — not pretraining our own.

### Where it's invoked — cascade, not firehose

Running a frontier LLM on **every** utterance is wasteful; most utterances are obvious. Production shape:

```
utterance ─→ deterministic phrase rules (0 ms, free)
     │  confident (likelihood ≤0.3 or ≥0.7)? → done
     └→ embedding similarity (~1 ms, ~free — the demo's bag-of-words
        example bank is the offline stand-in for this tier)
          │  confident? → done
          └→ LLM classifier (only ambiguous residue, ~10–30% of utterances)
```

The LLM runs **async, off the hot path**: the engine scores immediately with the cheap tier, and when the LLM verdict lands ~1s later, the utterance's analysis is upgraded and the meeting re-scored (the demo's pre-computed-analyses mechanism is exactly this patch-and-rescore flow). Batch adjacent utterances per request; cache by utterance hash (interview questions repeat a lot across a company's interviews).

### Cost sanity check

A 60-minute interview ≈ 120 utterances. Full-LLM-everything at ~200 input + 60 output tokens each ≈ 24K in / 7K out per meeting → roughly **$0.05/meeting on Haiku 4.5, ~$0.29 on Opus 4.8** at current list prices. With the cascade (LLM on ~30%), divide by ~3. Even at thousands of interviews/day this is small next to the cost of one fraud detector analyzing the wrong participant.

### Beyond utterance classification

Once a frontier LLM is in the loop it can add two more evidence sources, still inside the same weighted-evidence framework (never as an oracle):

- **Meeting-level role reasoning** — every N events, hand the LLM the compact meeting summary (roster, name history, per-participant turn stats, decision state) and ask for a structured second opinion + anomaly flags ("participant renamed to the candidate's name but has asked 6 questions"). Feeds the consistency/anomaly signal.
- **Calendar-invite parsing** — free-text invites ("Panel w/ P. Mehta + shadow: R. Gupta; candidate AMIT S.") parsed into structured metadata far more robustly than regexes.

## 6. Stream-processing backbone

```
platform adapters (A/B/C) ──► Kafka topic "meeting-events", partitioned by meetingId
                                    │  (ordering per meeting is free within a partition)
                                    ▼
                     reducer/scorer worker (one logical owner per meeting)
                     · consumes events, applies applyMeetingEvent, re-scores
                     · checkpoints runtime state every N events (Redis/Postgres)
                     · emits CandidateIdentificationResult to "candidate-decisions"
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     fraud detectors        review UI / alerts      audit log (immutable,
     (attach to selected    (uncertain decisions    replayable — the reducer is
     participant's media)    → human queue)          deterministic, so any decision
                                                     can be reconstructed)
```

Engineering notes:

- **Ordering & lateness**: sequence within a meeting comes from the partition; cross-source skew (ASR finals lag roster events) is handled with a small watermark buffer (~2 s) before applying, plus idempotent event IDs for webhook retries/dedup.
- **Recovery**: worker dies → replay from the last checkpoint through the log; the pure-reducer design (unchanged from the demo) makes this trivial and makes shadow-mode A/B of new weights possible on recorded logs.
- **Scale**: scoring is O(participants × signals) with tiny constants — thousands of concurrent meetings are CPU-negligible; the real capacity planning is ASR minutes and bot seats.
- **Decision stability**: downstream detectors subscribe to *changes* (selected → uncertain transitions are alerts, not silent flips), with the smoothing + margin logic preventing thrash.

## 7. Privacy, consent, compliance

- Bot presence / recording indicators satisfy platform policy and two-party-consent jurisdictions; the invite footer discloses AI processing.
- Retention: raw media minimized (process-and-discard where law allows); events + decisions retained for audit; PII encrypted at rest, per-tenant keys.
- Self-hosted ASR/classifier tiers exist precisely for clients whose data cannot transit third-party APIs.
- If consented visual signals (face presence/liveness) are ever added, they enter as *additional weak evidence* under biometric-law review (BIPA/GDPR) — never as the sole identifier.

## 8. Rollout and the learning loop

1. **Shadow mode** — run against live interviews, log decisions, humans confirm; no downstream consumer yet. Produces the labeled dataset.
2. **Assisted mode** — decisions drive the review UI; `uncertain` routes to humans whose choices become labels.
3. **Autonomous mode** — fraud detectors consume `selected` directly; `uncertain` still goes to humans.
4. **The flywheel** — labels feed (a) weight/threshold calibration (turning the candidate score into a real calibrated probability), (b) fine-tuning the self-hosted classifier, (c) regression scenarios added to the synthetic suite. This is the "continues learning as more interview data becomes available" loop, implemented as data engineering rather than hand-waving.

## 9. Latency budget (target, event → decision)

| Stage | Budget |
|---|---|
| Platform/bot event delivery | 100–500 ms |
| ASR final hypothesis (speech end → text) | 300–800 ms |
| Adapter normalization + Kafka | < 50 ms |
| Reducer + scoring | < 5 ms |
| Decision publish | < 50 ms |
| **Total (transcript-driven update)** | **≈ 0.5–1.5 s** |
| Async LLM verdict upgrade (cascade tier 3) | +1–3 s, patches retroactively |
