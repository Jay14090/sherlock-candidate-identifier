# Evaluation

> **How to read these numbers:** this is **controlled behavioral validation, not a real-world accuracy benchmark**. The scenarios are synthetic and designed to test the failure modes described in the challenge. Candidate scores are evidence-based scores, not calibrated probabilities.

## Method

Every scenario is replayed start-to-finish through the same engine the dashboard uses, and the final decision is compared against the scenario's expected outcome. This is automated two ways:

- `npm run evaluate` — prints the table below (exits non-zero if any scenario regresses).
- `npm test` — 61 unit tests additionally assert *intermediate* behavior: `insufficient_data` while the leader has only generic events, the device-name scenario being unselected before transcript evidence, smoothing limits on per-event jumps, public-domain email neutrality, evidence-coverage bounds, evidence content, and score bounds on every event of every scenario.

## Results

Measured output (`npm run evaluate`, deterministic — identical on every run):

| Scenario | Expected Candidate | System Result | Candidate score | Evidence coverage | Margin | Status | Notes |
|---|---|---|---:|---:|---:|---|---|
| clear-match | p2 | p2 | 0.87 | 0.89 | 0.64 | Selected | Name + email + transcript + timing all aligned |
| device-name | p2 | p2 | 0.73 | 0.89 | 0.32 | Selected | Started as insufficient data; transcript role resolved it; rename to "Ananya S" rewarded |
| nickname | p2 | p2 | 0.72 | 0.67 | 0.49 | Selected | "Rohit K" matched via token + initial tier (0.65), behavior did the rest |
| multiple-interviewers-observers | p2 | p2 | 0.80 | 0.67 | 0.40 | Selected | Interviewer with most speaking time scored 0.22; silent observer 0.41 |
| missing-metadata | p2 | p2 | 0.71 | 0.67 | 0.38 | Selected | No candidate name; email local-part "neha.verma" ≈ "Neha V" + behavior |
| ambiguous | none (abstain) | none (abstained) | 0.68 | 0.67 | 0.02 | Uncertain | Top two within 2 points — correctly refused to guess |
| wrong-name | p2 | p2 | 0.80 | 0.78 | 0.52 | Selected | Exact email match overrode the "Amit Shah" metadata typo |

## Summary

- **Synthetic scenario pass rate: 7/7** — top-1 identification on the six scenarios with a known candidate, plus correct abstention on the ambiguous scenario.
- **Average candidate score on correct selections: 0.77.**
- The scenarios were designed to probe specific failure modes, not sampled from real traffic — the pass rate validates reasoning behavior across representative edge cases, nothing more.

## Edge cases covered

| Edge case | Where | How it's handled |
|---|---|---|
| Candidate joins with device name | device-name | Device-name detection neutralizes the name signal; transcript role carries the decision |
| Candidate renames mid-meeting | device-name | Name history tracked; rename toward the candidate name boosts name + consistency signals |
| Nickname / abbreviated name | nickname | Token + initial matching tier |
| Wrong candidate name in metadata | wrong-name | Email local-part rescue + exact email match outrank the incorrect name |
| Multiple interviewers | multiple-interviewers-observers | Interviewer name/email lists + question-style transcript penalties |
| Interviewer speaks more than candidate | multiple-interviewers-observers | Speaking signal counts *answer-style turns*, not raw duration |
| Silent observer, webcam off | multiple-interviewers-observers, device-name | Silence + webcam-off penalties activate only after enough meeting activity |
| Missing candidate name | missing-metadata | Neutral name score with explicit evidence; email local-part fallback |
| Missing participant emails | most scenarios | Neutral email score with explicit evidence |
| Shared public email domain | unit tests | gmail.com/outlook.com/etc. same-domain matches are neutral, never supporting evidence |
| Two plausible candidates | ambiguous | Margin threshold forces abstention with competing evidence displayed |
| Early meeting (no useful evidence yet) | all | `insufficient_data` until the leader has identity/email/transcript evidence or two distinct non-media signals — generic joins/webcam events never suffice |
| Host flag on the candidate's side | (soft rule) | Host is a soft penalty, never a hard exclusion |

## What the unit tests assert beyond finals

- Normalization: case/punctuation handling, device detection (including *not* flagging "Meeting Observer" as a device), Levenshtein correctness, all name-comparison tiers.
- Transcript: candidate intros score candidate-like, questions score interviewer-like, neutral text stays neutral, single phrases can't produce extreme scores, mixed utterances detected, determinism.
- Email: public-domain same-domain neutrality, organization-domain weak support, exact matches unaffected.
- Decision lifecycle: `insufficient_data` before anyone joins and while the leader has only generic events; decidable once transcript evidence exists; per-event score jumps stay < 0.25 once history exists; scores and coverage always within [0,1]; no crash on any event of any scenario.
- Data integrity: every event references a real participant, unique IDs, chronological order, parseable timestamps, payload shape checks.

## Limitations of this evaluation

- Seven curated scenarios cannot represent the diversity of real interviews (accents/languages, adversarial behavior, unusual meeting formats).
- The scenarios were authored alongside the weight tuning, so there is inherent circularity — treat the pass rate as a behavioral demonstration. The production mitigation is a held-out calibration set of labeled real meetings, with thresholds tuned against precision/abstention targets.
- Transcript classification is intentionally simple in the offline demo; this evaluation says nothing about robustness to paraphrase. The semantic-classifier upgrade path is documented in [scoring.md](scoring.md#transcript-classifier-roadmap).
- No latency/throughput measurements — the engine is trivially fast at meeting scale, but a production benchmark would measure the full adapter → decision pipeline.
