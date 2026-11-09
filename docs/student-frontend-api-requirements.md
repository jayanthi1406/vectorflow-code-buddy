# Student frontend API requirements

This document describes the data contracts the student UI needs. Authentication and registration are integrated with the verified backend routes listed below. Competition services still use local **DEMO DATA** fixtures in demo mode; real authenticated sessions show the backend profile and mark competition features unavailable rather than showing demo results. The remaining competition API contracts still need to be agreed with the backend team before adding HTTP calls. The UI consumes normalized service results, so service implementations can be replaced without changing page components.

### Current backend integration status

The student frontend integrates `POST /api/auth/google`, `POST /api/auth/register`, and `GET /api/auth/me`. The Google ID token is verified by the backend, registration sends only USN and academic year, and the authenticated profile is retrieved with the backend-issued JWT. JWT authorization is supplied centrally through the API client. Real and demo sessions are kept separate.

The latest audited backend commit, [`d83749e`](https://github.com/jayanthi1406/vectorflow-code-buddy/commit/d83749e3e97c1e96b3bd236ed6ef28c300bec7e1), does not register student-facing APIs for competition configuration, question assignment, round entry/status, timer status/deadline, evaluation results, wallet transactions, or competition records. The question-bank routes present in that commit are admin-protected and are not student assignment APIs. Those competition features remain demo-only for demo sessions and unavailable for real sessions until suitable student-facing APIs are implemented.

## Authentication and registration

### Google identity verification

The browser receives a Google Identity Services ID token. The server must verify signature, issuer, audience and expiry, require `email_verified: true`, and enforce an email domain exactly equal to `vvce.ac.in` (case-insensitive domain comparison). Never trust JWT claims decoded by the browser. Return application identity/session data only after successful server verification.

Request fields:

- `idToken`: Google ID token obtained by Google Identity Services.

Implemented response shape: `{ success, token, registrationComplete, student }`. The backend-issued `token` is the JWT used for protected requests. The `student` object contains the canonical profile and competition snapshot fields returned by the backend, including `id`, `name`, `email`, `role`, `registrationComplete`, `usn`, `year`, `currentLevel`, `highestLevelReached`, `levelsCleared`, `competitionStatus`, `roundAvailability`, `walletBalance`, `totalEarned`, `totalRisked`, and `safeZoneAmount`.

Known returning students load their authenticated profile and go to their dashboard. First-time students receive the verified name and email and continue to registration. The frontend does not treat Google sign-in as successful until the backend accepts the ID token. Backend errors for invalid/expired tokens, unverified email, disallowed domain, and identity-provider failures are surfaced to the student.

### Student registration

Registration requires full name, unique USN, verified VVCE email, and year of study (`1st Year`, `2nd Year`, `3rd Year`, or `4th Year`). The name and email come from the verified identity and are read-only in the student form. The request may send USN and year; the server must associate the verified identity and derive the canonical name/email. Normalize USN consistently and enforce uniqueness in the database (including a unique index), not only with the browser demo validation.

The integrated `POST /api/auth/register` request contains only `usn` and `year`; the authenticated backend identity supplies name and email. On success, the backend returns `{ success, message, student }` with the canonical student profile. Duplicate USNs and validation failures are reported from backend errors. Registration is idempotent for the authenticated student when the same USN and year are submitted.

## Competition configuration and levels

Provide a competition configuration service independent from student progression. Configuration fields required by the UI:

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable competition identity and display name |
| `currency`, `locale` | Formatting of wallet, rewards, and stakes |
| `roundDurationSeconds` | One shared duration for the assigned questions |
| `supportedLanguages` | Labels shown to students |
| `questionsPerRound` | Assigned-question count (currently exactly `1`) |
| `levels[]` | Ordered level configuration below |

Each level needs `number`, display `name`, entry-fee amount, pass-reward amount, and optionally `isFinal`. The current competition has exactly six levels: L1 has a ₹0 entry fee and ₹100 pass reward; L2–L6 each have a ₹100 entry fee and ₹100 pass reward. The UI keeps the fee and reward as separate values. The backend's `entryRiskAmount` and `winningPayout` fields are normalized to frontend `entryFee` and `passReward` while retaining the original response fields. Whether the pass reward is gross or net of fees remains unconfirmed; the frontend must not infer wallet accounting from these two configuration values. The values in `src/data/demoCompetition.js` are sample local fixtures only; server configuration is authoritative in production.

The student progression response should include `currentLevel`, `highestLevelReached`, `levelsCleared`, `competitionStatus`, and `roundAvailability`. Suggested availability values are `unavailable`, `ready`, `inProgress`, `evaluationPending`, `cleared`, `eliminated`, `completed`, and `insufficientBalance`; finalize these with the backend team. The server derives progression from official events.

The student may request entry to an eligible round, but the server must authorize question access and atomically enforce the configured stake, available balance, and competition state. A failed entry must preserve the balance and must not mark the student eliminated. The demo entry service reads the configured stake but does not debit the mock wallet.

## Round, assigned questions, timer, and evaluation

The round/assignment response needs round ID, level number, status, configured timer information, and exactly one question assigned to this student for the level. First-year students receive one EASY question; second-, third-, and fourth-year students receive one HARD question. That assignment must be persisted by the server and returned unchanged after refresh. Questions are not part of competition-wide browser configuration and must not be sent until the student is authorized into their own round. The server must enforce that authorization on every request. The browser demo stores its fixture assignment locally for preview only; this is not equivalent to server persistence.

Each question needs stable `id`, `title`, `difficulty`, variable-length `statement`, `constraints[]`, input format, output format, and `examples[]`. Each example has its own optional ID/title plus input and output strings. Allow no examples, one example, or multiple examples; allow long statements and long sample data. The UI does not assume fixed question copy.

Timer information includes configured `durationSeconds`, `officialStartTime`, `deadline`, and timer-extension history. The three-minute value in the demo fixture is illustrative only. This is one shared timer for the round. Only authorized volunteer/admin operations can start or extend it. The server deadline is authoritative. Students can only read their timer and evaluation.

Evaluation values are keyed by question ID and use agreed values such as `Pending`, `PASS`, and `FAIL`. Each question's evaluation and the overall pass count are read-only to the student.

## Wallet and transactions

Wallet response fields: current `balance`, cumulative rewards earned, total entry fees paid, and transaction history. A transaction includes stable ID, type, signed amount, resulting balance, level/reference, timestamp, and display label. The backend currently exposes a `totalRisked` field; the frontend may normalize it to total entry fees paid while preserving the original value. Whether a pass reward is gross or net of entry fees is not yet confirmed. The frontend must display the current balance, cumulative rewards, and cumulative fees separately and must not calculate or mutate wallet values.

Only the competition server may post entry fees, rewards, reversals, or adjustments. The client is read-only. Apply the rules and the money values from competition/level configuration on the server, including failure and timer-expiry outcomes, no-retry behavior, low-balance handling without elimination, and completion after passing L6.

## Competition-wide records

Return exactly two aggregates to students, with no participant ranking/list:

- `highestRoundReached`: level, participant name, and achievement time.
- `highestCumulativeEarnings`: gross cumulative amount earned, participant name, and achievement time.

The amount is cumulative gross rewards, not wallet balance after stakes. Define deterministic tie handling (the demo picks earliest achievement, then alphabetical name). The records service should reflect official competition data as it changes.

## Service modules and errors

The student client has separate adapters for authentication, registration, profile, assigned questions, competition configuration, level configuration, round information, timer, evaluation, wallet, progression, and competition records. The authentication, registration, and profile adapters use the implemented backend endpoints; the competition adapters remain mock-backed until corresponding student-facing route contracts, authentication transport, status enums, and domain error codes are available. Keep UI models normalized behind those adapters and add endpoint-specific HTTP calls inside service adapters only after those contracts are verified.

The environment exposes `VITE_API_BASE_URL` for the server origin and `VITE_GOOGLE_CLIENT_ID` for the public Google OAuth client ID. Never put a Google client secret in a `VITE_` variable. Suggested structured errors include unauthenticated/forbidden, incomplete registration, duplicate USN, unavailable round, insufficient balance, stale round state, and validation failure.

All protected data must be scoped to the authenticated student by the server. Enforce student/volunteer/admin permissions server-side even where the student UI is read-only.

## Frontend API transport

The student frontend provides an endpoint-agnostic JSON transport in `src/services/apiClient.js`. It reads the server origin from `VITE_API_BASE_URL`, supports a centrally supplied Bearer access-token provider, and returns parsed JSON (or `null` for an empty response). It does not define route paths or HTTP contracts. The authentication service uses it for the implemented auth routes; competition demo adapters remain available for explicit demo sessions and are not used to supply competition data in real sessions.

Transport failures use the exported `ApiError` shape (`code`, `status`, `method`, `url`, `responseBody`, and `cause`). Error codes distinguish configuration/request errors, token-provider errors, network/response-read errors, invalid JSON, general HTTP errors, 401 unauthorized responses, server errors, and aborted requests. HTTP error bodies are retained when valid JSON; invalid JSON on an error response is recorded with `invalidJson` while preserving the HTTP status category.

The authentication service supplies the API client's token callback with `apiClient.setAccessTokenProvider(() => currentAccessToken)`. The API client adds the Bearer header centrally; it does not read, store, refresh, or log tokens. The authentication service keeps the JWT in memory and `sessionStorage` for refresh restoration within the browser tab, and clears it on sign-out or an unauthorized response. Demo session data remains separate from the real authentication session.
