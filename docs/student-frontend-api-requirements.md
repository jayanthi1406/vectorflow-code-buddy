# Student frontend API requirements

This document describes the data contracts used by the student UI. Authentication, competition configuration, level information, question allocation, active round state, round history, wallet transactions, competition records and the current student's rank summary use verified backend APIs. Demo services remain isolated to explicitly selected demo sessions. Backend responses are normalized behind service adapters; the backend remains authoritative for identity, assignment, timer, evaluation, wallet and progression.

### Current backend integration status

The student frontend integrates `POST /api/auth/google`, `POST /api/auth/register`, and `GET /api/auth/me`; JWT authorization is supplied centrally through the API client. The competition adapter also uses `GET /api/competition/config`, `GET /api/rounds/level-info`, `POST /api/rounds/allocate`, `GET /api/rounds/active`, `GET /api/student/rounds/history`, `GET /api/student/transactions`, `GET /api/competition/records`, and `GET /api/leaderboard/me`. Real and demo sessions are kept separate.

The latest inspected backend branch, `feature/backend` at [`ab9d122`](https://github.com/jayanthi1406/vectorflow-code-buddy/commit/ab9d122fe8961b4f842779d9112497dd0d20ae02), includes the APIs above. The student-only `GET /api/leaderboard/me` route supplies a personal position summary. The student UI does not request the conventional participant list from `GET /api/leaderboard`. Volunteer start, extension, evaluation, settlement and progression routes exist but are volunteer-protected and are never called by the student client.

| Method and route | Access | Student use and response summary |
| --- | --- | --- |
| `POST /api/auth/google` | Public | `{ idToken }` → backend JWT, registration flag and student identity. |
| `POST /api/auth/register` | Student JWT | `{ usn, year }` → `{ success, message, student }`; duplicate USN returns 409. |
| `GET /api/auth/me` | Student JWT | `{ success, student }` with verified profile and live competition state. |
| `GET /api/competition/config` | Student JWT | `{ success, totalLevels, levels[] }` with active level settings. |
| `GET /api/rounds/level-info` | Student JWT | Current level, wallet balance and that level's settings. |
| `POST /api/rounds/allocate` | Student JWT | No request body; returns created or persistent existing round/question. Does not debit wallet or check balance. |
| `GET /api/rounds/active` | Student JWT | Current round, question snapshot, status and timer fields; returns `404 ROUND_NOT_ALLOCATED` if none exists. |
| `GET /api/student/rounds/history?page=&limit=` | Student JWT | Paginated own rounds with safe evaluation summaries. |
| `GET /api/student/transactions?page=&limit=` | Student JWT | Paginated own ledger plus balance, earned/risked and safe-zone values. |
| `GET /api/competition/records` | Student, volunteer or admin JWT | Two record aggregates plus summary; student UI displays only the two records. |
| `GET /api/leaderboard/me` | Student JWT | Personal rank and participant count; displayed only as the signed-in student's own position, with no participant list. |

Volunteer-only lifecycle routes are `GET /api/volunteer/students/:usn/round`, `POST .../round/start`, `POST .../round/extend`, `POST .../round/evaluate`, `POST .../round/settle`, and `POST .../round/progress`. They are outside the student service boundary. The student client calls only `/api/leaderboard/me` for the authenticated student's own position; it does not call `/api/leaderboard` or display a participant ranking list.

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

`GET /api/competition/config` returns `{ success, totalLevels, levels[] }`; each level includes `number`, `name`, `entryRiskAmount`, `winningPayout`, `losingPayout`, `safeZoneAmount`, `isSafeZone`, `isFinal`, and `durationSeconds`. `GET /api/rounds/level-info` returns the authenticated student's `currentLevel`, `walletBalance`, and current level configuration. The frontend maps `entryRiskAmount` to a display `entryFee` and `winningPayout` to a display `passReward`, while preserving the original fields. The frontend validates that configuration contains six levels. Runtime configuration is authoritative; the seed script contains CodeBuddy 2.0 defaults (including safe zones at L1/L4 and a zero entry risk at L5), but existing database records are not overwritten by seeding. The UI never calculates wallet settlements from these fields. Demo values in `src/data/demoCompetition.js` are local-only fixtures and must not be shown in real sessions.

`GET /api/auth/me` returns `currentLevel`, `highestLevelReached`, `levelsCleared`, `competitionStatus`, and `roundAvailability`. The currently observed availability values include `unavailable`, `ready`, `inProgress`, `evaluationPending`, `cleared`, `eliminated`, and `completed`. There is no backend `insufficientBalance` state; the dashboard compares backend-reported balance and current level `entryRiskAmount` to disable its allocation action. That display check is not authoritative backend enforcement.

`POST /api/rounds/allocate` is a protected student route with no request body. It creates a persistent assignment for the authenticated student's current level or returns that same round if already allocated. It checks registration, academic year, level range, competition status and question availability. **Current backend limitation:** allocation does not validate `walletBalance` against `entryRiskAmount`, debit a stake, or change progression. The dashboard disables the allocation action when reported balance is below the configured risk amount, but this UI check is not a backend security boundary. Backend coordination is required before the competition can safely enforce low-balance entry. The demo entry service does not debit the mock wallet.

## Round, assigned questions, timer, and evaluation

`POST /api/rounds/allocate` returns `{ success, isExisting, round }` with one frozen question snapshot. First-year students receive one EASY question; second-, third-, and fourth-year students receive one HARD question. The backend keys the assignment to student and level, so repeat allocation returns the existing snapshot. `GET /api/rounds/active` returns the authenticated student's current round or `404 ROUND_NOT_ALLOCATED`. The browser demo stores its fixture assignment locally for preview only; this is not equivalent to server persistence.

The backend's student-safe question snapshot currently returns `questionId`, `title`, `statement`, `constraints[]`, `examples[]`, `difficulty`, and `levelNumber`. It does **not** currently include `inputFormat` or `outputFormat`; the UI renders these only when a future backend response supplies them. Examples are variable length and hidden test cases are excluded.

The active round includes configured `durationSeconds`, `startedAt`, `deadline`, `remainingSeconds`, and `isExpired`. A `ready` round has no active timer until a volunteer starts it. Student `GET /api/rounds/active` is read-only from the student route; the server may synchronize expired status during that request. Volunteer-only start and extension operations cannot be called by students. The UI countdown is display-only and based on the returned remaining time/deadline; the server deadline is authoritative. There is no student timer-control API.

The student does not have a separate evaluation endpoint. `GET /api/student/rounds/history` returns each round with a safe `evaluation` summary (`status`, `remarks`, `programmingLanguage`, evaluation/settlement/progression timestamps and flags). This is the read-only source for evaluation display. Volunteer-only evaluation, settlement and progression actions are not called by the student client.

## Wallet and transactions

`GET /api/student/transactions?page=&limit=` returns `walletBalance`, `totalEarned`, `totalRisked`, `safeZoneAmount`, pagination and transaction entries (`id`, `type`, non-negative `amount`, `balanceAfter`, `levelNumber`, `roundId`, `description`, `timestamp`). The UI labels `totalRisked` as reported by the backend rather than reinterpreting it as fees paid. Financial settlement uses the backend's CodeBuddy 2.0 level configuration and volunteer-protected settlement/progression flow. The student frontend never posts wallet changes or calculates settlement amounts.

Only the competition server may post entry fees, rewards, reversals, or adjustments. The client is read-only. Volunteer-protected settlement/progression applies the configured wallet outcomes, evaluation, elimination and L6 completion. Current `POST /api/rounds/allocate` does not enforce the configured balance requirement or debit the wallet, so low-balance protection is incomplete until the backend adds that enforcement to its authoritative entry flow.

## Competition-wide records

`GET /api/competition/records` (also available at `/api/leaderboard/records`) returns summary plus two milestone records. The frontend uses only these two records; it does not call the conventional ranking endpoint. Display exactly two aggregates, with no participant ranking/list:

- `highestRoundReached`: level, participant name, and achievement time.
- `highestCumulativeEarnings`: gross cumulative amount earned, participant name, and achievement time.

The amount is cumulative gross rewards, not wallet balance after stakes. Define deterministic tie handling (the demo picks earliest achievement, then alphabetical name). The records service should reflect official competition data as it changes.

## Service modules and errors

The student client keeps adapters for authentication, registration, profile, question assignment, competition/level configuration, round status, timer display, evaluation history, wallet history, competition records and personal rank summary. Verified real competition calls are isolated in `backendCompetitionService`; demo adapters continue to use local mock data only in demo mode. The student client does not call any volunteer route or the conventional participant list endpoint. Competition records remain exactly two competition-wide milestones.

The environment exposes `VITE_API_BASE_URL` for the server origin and `VITE_GOOGLE_CLIENT_ID` for the public Google OAuth client ID. Never put a Google client secret in a `VITE_` variable. Suggested structured errors include unauthenticated/forbidden, incomplete registration, duplicate USN, unavailable round, insufficient balance, stale round state, and validation failure.

All protected data must be scoped to the authenticated student by the server. Enforce student/volunteer/admin permissions server-side even where the student UI is read-only.

## Frontend API transport

The student frontend provides a centralized JSON transport in `src/services/apiClient.js`. It reads the server origin from `VITE_API_BASE_URL`, supports a centrally supplied Bearer access-token provider, and returns parsed JSON (or `null` for an empty response). Endpoint-specific calls live in service adapters. Real competition requests are isolated in `src/services/backendCompetitionService.js`; demo adapters remain available only for explicit demo sessions and do not supply competition data to real sessions.

Transport failures use the exported `ApiError` shape (`code`, `status`, `method`, `url`, `responseBody`, and `cause`). Error codes distinguish configuration/request errors, token-provider errors, network/response-read errors, invalid JSON, general HTTP errors, 401 unauthorized responses, server errors, and aborted requests. HTTP error bodies are retained when valid JSON; invalid JSON on an error response is recorded with `invalidJson` while preserving the HTTP status category.

The authentication service supplies the API client's token callback with `apiClient.setAccessTokenProvider(() => currentAccessToken)`. The API client adds the Bearer header centrally; it does not read, store, refresh, or log tokens. The authentication service keeps the JWT in memory and `sessionStorage` for refresh restoration within the browser tab, and clears it on sign-out or an unauthorized response. Demo session data remains separate from the real authentication session.
