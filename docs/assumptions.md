# Assumptions

## Data access (granted by the challenge brief)

The challenge statement says to assume access to participant info, per-participant audio/video streams, speaker-attributed transcripts, and external metadata. Accordingly, the prototype assumes:

1. **Participant-level metadata is available**: participant IDs, display names, join/leave events, webcam on/off, screen-share events, and (sometimes) email addresses.
2. **A speaker-attributed transcript is available** in near-real-time. Utterances arrive already attributed to a participant ID (in production this comes from platform captions or diarization).
3. **Speaking activity is available** as duration/turn events even when no transcript text exists.
4. **External metadata may exist**: candidate name, candidate email, scheduled start time, interviewer names/emails, calendar invite text — but *any* of these can be missing or wrong. The system is explicitly designed for that.

## Modeling assumptions

5. **Audio/video streams are represented as derived signals.** Raw media processing (voice embeddings, face detection) is out of scope; webcam state, speaking duration, and transcript text stand in for what those pipelines would emit. This matches Sherlock's architecture, where fraud detectors consume the identified candidate's streams downstream.
6. **Events are simulated through local JSON** and replayed on a timer. The event shapes are designed to match what a real platform adapter would emit, so the simulation boundary is exactly one adapter away from production.
7. **Behavioral priors** (encoded as weak signals, never hard rules):
   - Candidates usually join within a few minutes of the scheduled start; interviewers slightly early; observers late.
   - Candidates answer in first person about their own experience; interviewers ask questions and run the meeting.
   - Observers tend to stay silent with webcams off.
   - The meeting host is *usually* an interviewer — soft penalty only, since candidates can host test meetings.
8. **Candidate identity is inferred probabilistically, never guaranteed.** The system abstains (`uncertain`) when the top score is below 0.68 or the margin over the runner-up is below 0.12.
9. **Missing information is neutral, not negative.** A participant without an exposed email gets a 0.4 email score, identical to everyone else without email data, and the evidence log states this explicitly.
10. **One candidate per meeting.** Panel interviews with multiple simultaneous candidates would require selecting top-N with per-slot margins — a straightforward extension of the same decision logic, but out of scope here.
11. **English-language interviews.** The offline hybrid transcript classifier (rule phrases + example banks) is English-only; the LLM classifier extension point removes this constraint.

## Scope decisions

12. **No authentication or database** — they don't advance the core problem and add reviewer setup friction. `npm install && npm run dev` is the entire setup.
13. **No live platform integration** — the challenge is candidate identification reasoning, not OAuth plumbing. See [alternatives.md](alternatives.md) for the full trade-off discussion.
14. **No biometrics** — face recognition as the primary identifier has consent/privacy problems, fails with cameras off, and answers a different question (identity verification) than the one asked (participant role identification). Discussed in [alternatives.md](alternatives.md).
