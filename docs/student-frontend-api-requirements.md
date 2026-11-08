# Student frontend API requirements

This document describes the data contracts the student UI needs. It intentionally does not assign endpoint paths or HTTP methods; agree those with the backend team before adding HTTP calls. The UI consumes normalized service results. Current services return local **DEMO DATA** fixtures; replacing those service implementations should not require changes to the page components.

## Authentication and registration

### Google identity verification

The browser receives a Google Identity Services ID token. The server must verify signature, issuer, audience and expiry, require `email_verified: true`, and enforce an email domain exactly equal to `vvce.ac.in` (case-insensitive domain comparison). Never trust JWT claims decoded by the browser. Return application identity/session data only after successful server verification.

Request fields:

- `idToken`: Google ID token obtained by Google Identity Services.

Response fields:

- `session`: server-issued session metadata, including expiry and the agreed browser transport.
- `identity.googleSubject`: stable Google subject identifier.
- `identity.name`, `identity.email`, `identity.emailVerified`.
- `identity.registrationComplete`: whether an existing student profile is complete.

Known returning students should go directly to their dashboard. First-time students receive the verified name and email and continue to registration. Define structured errors for invalid/expired token, unverified email, disallowed domain, and unavailable identity provider. The existing Google button will not grant access until server verification is connected.

### Student registration

Registration requires full name, unique USN, verified VVCE email, and year of study (`1st Year`, `2nd Year`, `3rd Year`, or `4th Year`). The name and email come from the verified identity and are read-only in the student form. The request may send USN and year; the server must associate the verified identity and derive the canonical name/email. Normalize USN consistently and enforce uniqueness in the database (including a unique index), not only with the browser demo validation.

Response student fields: `id`, `name`, `usn`, `email`, `emailVerified`, and `year`, plus `registrationComplete`. Return a field-level conflict for an already-registered USN. Registration should be idempotent for its authenticated student.

## Competition configuration and levels

Provide a competition configuration service independent from student progression. Configuration fields required by the UI:

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable competition identity and display name |
| `currency`, `locale` | Formatting of wallet, rewards, and stakes |
| `roundDurationSeconds` | One shared duration for the assigned questions |
| `supportedLanguages` | Labels shown to students |
| `questionsPerRound` | Assigned-question count |
| `levels[]` | Ordered level configuration below |

Each level needs `number`, display `name`, `entryStake`, `reward`, and optionally `isFinal`. The UI reads stake, reward, count, names, and level numbers from this service response. Level-one free entry, subsequent entry stakes, reward amounts, final-level behavior, and duration are competition configuration, not page constants. The values in `src/data/demoCompetition.js` are sample local fixtures only; the API response is authoritative in production.

The student progression response should include `currentLevel`, `highestLevelReached`, `levelsCleared`, `competitionStatus`, and `roundAvailability`. Suggested availability values are `unavailable`, `ready`, `inProgress`, `evaluationPending`, `cleared`, `eliminated`, `completed`, and `insufficientBalance`; finalize these with the backend team. The server derives progression from official events.

The student may request entry to an eligible round, but the server must authorize question access and atomically enforce the configured stake, available balance, and competition state. A failed entry must preserve the balance and must not mark the student eliminated. The demo entry service reads the configured stake but does not debit the mock wallet.

## Round, assigned questions, timer, and evaluation

The round/assignment response needs round ID, level number, status, configured timer information, and the two questions assigned to this student. The backend selects one EASY and one HARD question for each eligible student. Questions are not part of competition-wide browser configuration and must not be sent until the student is authorized into their own round. The server must enforce that authorization on every request.

Each question needs stable `id`, `title`, `difficulty`, variable-length `statement`, `constraints[]`, and `examples[]`. Each example has its own optional ID/title plus input and output strings. Allow no examples, one example, or multiple examples; allow long statements and long sample data. The current UI renders strings and arrays without assuming fixed question copy.

Timer information includes configured `durationSeconds`, `officialStartTime`, `deadline`, and timer-extension history. The three-minute value in the demo fixture is illustrative only. This is one shared timer for the round. Only authorized volunteer/admin operations can start or extend it. The server deadline is authoritative. Students can only read their timer and evaluation.

Evaluation values are keyed by question ID and use agreed values such as `Pending`, `PASS`, and `FAIL`. Each question's evaluation and the overall pass count are read-only to the student.

## Wallet and transactions

Wallet response fields: current `balance`, cumulative `totalRewardsEarned`, cumulative `totalRisked`, and transaction history. A transaction includes stable ID, type, signed amount, resulting balance, level/reference, timestamp, and display label. Cumulative rewards mean gross rewards before stakes; they are not the current wallet balance.

Only the competition server may post stakes, rewards, reversals, or adjustments. The client is read-only. Apply the rules and the money values from competition/level configuration on the server, including failure and timer-expiry outcomes, retries, low-balance handling, and final completion.

## Competition-wide records

Return exactly two aggregates to students, with no participant ranking/list:

- `highestRoundReached`: level, participant name, and achievement time.
- `highestCumulativeEarnings`: gross cumulative amount earned, participant name, and achievement time.

The amount is cumulative gross rewards, not wallet balance after stakes. Define deterministic tie handling (the demo picks earliest achievement, then alphabetical name). The records service should reflect official competition data as it changes.

## Service modules and errors

The student client has separate adapters for authentication, registration, profile, assigned questions, competition configuration, level configuration, round information, timer, evaluation, wallet, progression, and competition records. Keep UI models normalized behind those adapters. Only add HTTP behavior once request/response formats, authentication transport, status enums, and error codes are agreed.

The environment exposes `VITE_API_BASE_URL` for the server origin and `VITE_GOOGLE_CLIENT_ID` for the public Google OAuth client ID. Never put a Google client secret in a `VITE_` variable. Suggested structured errors include unauthenticated/forbidden, incomplete registration, duplicate USN, unavailable round, insufficient balance, stale round state, and validation failure.

All protected data must be scoped to the authenticated student by the server. Enforce student/volunteer/admin permissions server-side even where the student UI is read-only.
