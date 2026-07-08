# Evaluation

## Method

Every scenario is replayed start-to-finish through the same engine the dashboard uses, and the final decision is compared against the scenario's expected outcome. This is automated two ways:

- `npm run evaluate` — prints the table below (exits non-zero if any scenario regresses).
- `npm test` — 54 unit tests additionally assert *intermediate* behavior: early `insufficient_data`, the device-name scenario being unselected before transcript evidence, smoothing limits on per-event jumps, evidence content, and score bounds on every event of every scenario.

## Results

Measured output (`npm run evaluate`, deterministic — identical on every run):

| Scenario | Expected Candidate | System Result | Final Confidence | Margin | Status | Notes |
|---|---|---|---:|---:|---|---|
| clear-match | p2 | p2 | 0.87 | 0.64 | Selected | Name + email + transcript + timing all aligned |
| device-name | p2 | p2 | 0.73 | 0.32 | Selected | Started uncertain; transcript role resolved it; rename to "Ananya S" rewarded |
| nickname | p2 | p2 | 0.72 | 0.49 | Selected | "Rohit K" matched via token + initial tier (0.65), behavior did the rest |
| multiple-interviewers-observers | p2 | p2 | 0.80 | 0.40 | Selected | Interviewer with most speaking time scored 0.22; silent observer 0.41 |
| missing-metadata | p2 | p2 | 0.71 | 0.38 | Selected | No candidate name; email local-part "neha.verma" ≈ "Neha V" + behavior |
| ambiguous | none (abstain) | none (abstained) | 0.68 | 0.02 | Uncertain | Top two within 2 points — correctly refused to guess |
| wrong-name | p2 | p2 | 0.80 | 0.52 | Selected | Exact email match overrode the "Amit Shah" metadata typo |

## Accuracy framing

- **Top-1 accuracy on scenarios with a known candidate: 6/6.**
- **Correct abstention on the ambiguous scenario: 1/1.**
- **Average confidence on correct selections: 0.77.**
- Across six designed scenarios plus one abstention case, the prototype produced the expected outcome every time. **This is not a production benchmark** — the scenarios were designed to probe specific failure modes, not sampled from real traffic. It validates reasoning behavior across representative edge cases.

## Edge cases covered

| Edge case | Where | How it's handled |
|---|---|---|
| Candidate joins with device name | device-name | Device-name detection neutralizes name signal; transcript role carries the decision |
| Candidate renames mid-meeting | device-name | Name history tracked; rename toward candidate name boosts name + consistency signals |
| Nickname / abbreviated name | nickname | Token + initial matching tier |
| Wrong candidate name in metadata | wrong-name | Email local-part rescue + exact email match outrank the bad name |
| Multiple interviewers | multiple-interviewers-observers | Interviewer name/email lists + question-style transcript penalties |
| Interviewer speaks more than candidate | multiple-interviewers-observers | Speaking signal counts *answer-style turns*, not raw duration |
| Silent observer, webcam off | multiple-interviewers-observers, device-name | Silence + webcam-off penalties activate only after enough meeting activity |
| Missing candidate name | missing-metadata | Neutral name score with explicit evidence; email local-part fallback |
| Missing participant emails | most scenarios | Neutral email score with explicit evidence |
| Two plausible candidates | ambiguous | Margin threshold forces abstention with competing evidence displayed |
| Early meeting (no evidence yet) | all | `insufficient_data` until 3 events; all-neutral scores |
| Host flag on the candidate's side | (soft rule) | Host is a soft penalty, never a hard exclusion |

## What the unit tests assert beyond finals

- Normalization: case/punctuation handling, device detection (including *not* flagging "Meeting Observer" as a device), Levenshtein correctness, all name-comparison tiers.
- Transcript: candidate intros score candidate-like, questions score interviewer-like, neutral text stays 0.4/0.4, single phrases can't produce extreme scores, mixed utterances detected, determinism.
- Scoring lifecycle: `insufficient_data` before 3 events; device-name scenario **not** selected after only join/webcam events; per-event score jumps stay < 0.25 once history exists; scores always within [0,1]; no crash on any event of any scenario.
- Data integrity: every event references a real participant, unique IDs, chronological order, parseable timestamps, payload shape checks.

## Limitations of this evaluation

- Seven curated scenarios cannot represent the diversity of real interviews (accents/languages, hostile fraud, unusual meeting formats).
- The scenarios were authored by the same person who tuned the weights — there is inherent overfitting risk. Mitigation in production: a held-out calibration set of labeled real meetings and threshold tuning against precision/abstention targets.
- Transcript classification is keyword-based; the evaluation says nothing about robustness to paraphrase (an LLM classifier behind the existing interface is the upgrade path).
- No latency/throughput measurements — the engine is trivially fast at meeting scale, but a production benchmark would measure the full adapter → decision pipeline.
