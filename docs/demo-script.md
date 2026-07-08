# Demo Video Script (5–10 minutes)

Target: a recorded walkthrough for the Sherlock team. Times are cumulative guides.

---

## 1. Problem context (0:00 – 1:00)

> "Sherlock's fraud detectors need to analyze the **candidate's** audio and video — but in a real meeting, figuring out *which participant is the candidate* is surprisingly hard. Candidates join as 'MacBook Pro', recruiters typo names, interviewers out-talk everyone, and observers lurk silently.
>
> I built a real-time multi-signal decision engine that identifies the candidate, updates its candidate score after every meeting event, explains its reasoning, and — critically — refuses to guess when the evidence is ambiguous. A wrong confident identification would poison every fraud detector downstream, so graceful uncertainty is a feature, not a cop-out."

## 2. Architecture (1:00 – 2:30)

Show `docs/architecture.md` diagram.

> "Meeting events — joins, renames, webcam toggles, screen shares, speech activity, and speaker-attributed transcript lines — flow through a normalization layer into three groups of signal extractors: identity, behavior, and transcript role.
>
> Nine weak signals are combined into a candidate score — an evidence-based score, deliberately not presented as a calibrated probability. No single signal can dominate: name match is only 18%, because names lie. Missing data is scored neutral, never zero, and a separate evidence-coverage metric shows how much usable data backs each score. Scores are temporally smoothed so one event can't cause a wild swing.
>
> Selection needs the leader to have real evidence — not just joins and webcam toggles — plus two thresholds: score ≥ 68% **and** a 12-point lead over the runner-up. Otherwise the system says 'uncertain' out loud.
>
> Everything is deterministic TypeScript — reproducible tests, no API keys, runs offline. The transcript classifier sits behind an interface so an LLM can replace it later, and the event reducer is exactly the seam where a real Meet/Zoom/Teams adapter would plug in."

## 3. Signals and scoring (2:30 – 3:30)

Show the "How scoring works" panel in the left rail.

> "Quick tour of the signals: tiered name matching handles exact names, nicknames like 'Rohit K', and typos. Email matching includes local-part fallback. Interviewer exclusion uses the known interviewer list plus question-asking behavior — being the host is only a soft penalty. Speaking pattern counts *answer-style turns*, not raw duration, because interviewers usually talk the most. Then join timing, webcam, screen share, and a consistency signal that rewards stable evidence."

## 4. Live demo — clear match (3:30 – 4:30)

Scenario: **Clear candidate match**. Press Play at 1×.

> "Baseline first. Watch the status: it starts at 'Insufficient data' — the system won't decide while the leader has nothing but generic events behind them. As interviewers join early and the candidate joins right at the scheduled time, identity priors appear. When Jay introduces himself — 'my name is', 'I built' — the transcript signal kicks in and the candidate score crosses the threshold: selected at 87%, sixty-plus points clear of the interviewers, with high evidence coverage. The explanation panel shows every piece of evidence with its exact point impact."

## 5. Live demo — MacBook Pro (4:30 – 6:30)

Scenario: **Candidate joins as MacBook Pro**. Press Play.

> "Now the fun one. The candidate joins as 'MacBook Pro' — the name signal is explicitly weak: 'appears to be a device name, but this participant is not ruled out.' Notice the status: 'Insufficient data', because the leader has only joins and webcam events — the useful-evidence rule refuses to decide on that.
>
> The moment she starts answering — 'I am currently in my final year', 'I built a fraud detection dashboard' — the system becomes decidable. Transcript role and speaking pattern push her up while the interviewer list pins Priya and Rohan down.
>
> Then she renames to 'Ananya S' mid-meeting — watch the card: name history 'MacBook Pro → Ananya S', the consistency signal calls out the rename converging with the candidate identity, and she's selected at a 73% candidate score. No single rule did this; five weak signals agreed."

## 6. Live demo — ambiguous (6:30 – 7:45)

Scenario: **Ambiguous: two plausible candidates**. Press Play.

> "Finally, the case every heuristic system gets wrong. Candidate is 'Aman Singh' — and two participants, 'Aman S' and 'A Singh', both partially match and both give answer-style responses. There's no candidate email to break the tie.
>
> Final state: 68% versus 66%. A two-point margin. The system says 'Candidate uncertain', shows the competing evidence side by side, and names the fix: more transcript or verified identity evidence. In production this is where you'd route to a human reviewer instead of feeding the wrong person's video to the fraud detectors."

## 7. Trade-offs (7:45 – 8:45)

> "Deliberate choices: simulated events instead of platform OAuth — the hard problem is reasoning, and simulation makes every edge case reproducible. Deterministic keyword transcript classification instead of an LLM — reproducible evaluation, zero keys, zero latency; the LLM upgrade path is one interface away. No face recognition — consent-sensitive, fails with cameras off, and role identification isn't identity verification.
>
> Honest limitations: hand-tuned weights, seven authored scenarios, keyword matching can be paraphrased around. The synthetic scenario pass rate — 7 out of 7 with correct abstention — is controlled behavioral validation of the reasoning, not a real-world accuracy benchmark."

## 8. What I'd build next (8:45 – 9:30)

> "Next steps, in order: a real Meet or Zoom adapter feeding the same reducer over WebSocket; an LLM utterance classifier behind the existing interface; then replace hand weights with a learned ranker trained on labeled meetings, with calibrated confidence. Add diarization and consented liveness as extra signals, and route low-confidence meetings to humans whose decisions become training data — that's the 'keeps learning' loop.
>
> Repo has the full docs: architecture, assumptions, alternatives, evaluation, limitations. Thanks!"

---

## Recording checklist

- [ ] `npm run dev` running, browser at 100% zoom, dark room-friendly theme is default
- [ ] Run each scenario once before recording (warm compile)
- [ ] Use 1× speed for clear-match, 2× for the longer scenarios
- [ ] Hover the evidence rows when narrating point impacts
- [ ] Show `npm test` and `npm run evaluate` output at the end
