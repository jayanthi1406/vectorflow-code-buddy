# Code Buddy 2.0 integration readiness

Audit date: 2026-11-14. Source is the latest GitHub branch refs inspected through the read-only GitHub connector. The local Git fetch could not update remote refs in this environment; no branch was switched and no remote branch was changed.

## Branches inspected

| Branch | Commit | Scope |
| --- | --- | --- |
| `feature/student-frontend` | `fd3f3f4318b277eaf14aa80b529789a5e6044252` | Existing React/Vite student app; local workspace includes uncommitted student work. |
| `feature/admin-volunteer-frontend` | `fa1f50afc2ed22e566ff84ed0218cc69fac8cf4b` | Admin and volunteer UI modules, with an older duplicate student app. Only role-specific UI was reconciled. |
| `feature/backend` | `ab9d122fe8961b4f842779d9112497dd0d20ae02` | Express/Mongoose API under `backend/`. Read-only inspection only. |

The frontend branch has one Vite entry point (`src/main.jsx`), one `BrowserRouter`, React 18, Vite 6, Tailwind 4 and React Router 6. The admin/volunteer branch uses the same frontend stack. No additional frontend dependency was required. The local student branch did not contain `backend/`; the backend branch tree uses `backend/` as its application root.

## Student frontend routes

- Student: `/login`, `/register`, `/dashboard`, `/round`, `/result/:result`, `/records`, `/history`, `/profile`, `/wallet`.

This branch contains only the student-facing application and its routes. Admin and volunteer frontend modules remain on Khushi's branch and are not imported by the student entry point. The student app has one `BrowserRouter` and a student provider. Its own centralized JSON client uses `VITE_API_BASE_URL`; page-level fetch calls are not used. Backend authorization remains authoritative.

## Backend endpoints verified in source

These routes are mounted by `backend/server.js` in the inspected backend commit. Authentication is JWT-based for protected routes; `protectAdmin`/`authorizeAdmin` and `protectVolunteer`/`authorizeVolunteer` enforce staff roles.

### Student

| Method and route | Contract / use |
| --- | --- |
| `POST /api/auth/google` | Public; body `{ idToken }`; returns backend JWT, student profile and `registrationComplete`. |
| `POST /api/auth/register` | Student JWT; body `{ usn, year }`; completes registration. |
| `GET /api/auth/me` | Student JWT; canonical student profile and competition fields. |
| `GET /api/competition/config` | Student JWT; competition and six level configurations. |
| `GET /api/rounds/level-info` | Student JWT; current level, wallet balance and level configuration. |
| `POST /api/rounds/allocate` | Student JWT; no body; creates or returns a persistent year-matched question assignment. The controller does **not** check or debit entry risk. |
| `GET /api/rounds/active` | Student JWT; active round, question snapshot and official timer state; `404 ROUND_NOT_ALLOCATED` when absent. |
| `GET /api/student/rounds/history?page=&limit=` | Student JWT; own round history and evaluation summary. |
| `GET /api/student/transactions?page=&limit=` | Student JWT; own wallet ledger. |
| `GET /api/competition/records` | Student, volunteer or admin JWT; aggregate competition records; the student UI shows only the two required records. |
| `GET /api/leaderboard/me` | Student JWT; personal rank summary, without retrieving or displaying the participant list. |

### Admin

- `POST /api/admin/login`, `GET /api/admin/me`.
- `GET /api/admin/dashboard`.
- `GET /api/admin/participants` (search/filter/pagination), `GET /api/admin/participants/:identifier`, and per-participant `/rounds` and `/transactions` GET routes.
- `GET /api/admin/rounds`, `POST /api/admin/rounds/:roundId/recover`, and `GET /api/admin/transactions`.
- `GET /api/admin/levels`, `PUT /api/admin/levels/:number`, and `PATCH /api/admin/levels/:number/activate|deactivate`.
- `POST|GET /api/admin/questions`, `GET|PUT /api/admin/questions/:id`, and `PATCH /api/admin/questions/:id/deactivate|reactivate`.
- Volunteer management: `POST|GET /api/admin/volunteers`, `GET|PUT|PATCH /api/admin/volunteers/:id`, and password reset/deactivate/reactivate PATCH routes.

### Volunteer

- `POST /api/volunteer/login`, `GET /api/volunteer/me`.
- `GET /api/volunteer/students/:usn/round`.
- `POST /api/volunteer/students/:usn/round/start`.
- `POST /api/volunteer/students/:usn/round/extend` with `{ extensionSeconds, reason? }`.
- `POST /api/volunteer/students/:usn/round/evaluate` with `{ result: "PASS"|"FAIL", remarks?, programmingLanguage? }`.
- `POST /api/volunteer/students/:usn/round/progress` with an empty body; settles and applies progression, returning student, evaluation, transaction and round state.
- `POST /api/volunteer/students/:usn/round/settle` is implemented, but the frontend uses the atomic progress operation after evaluation to avoid duplicating settlement.

## Backend issues requiring team action

1. **Wallet enforcement is missing from student allocation.** `allocateQuestion` creates/returns a round without checking `walletBalance >= entryRiskAmount` or debiting the configured entry amount. Frontend-only checks are bypassable and are not financial enforcement. The student frontend enables a new real allocation only when the authenticated active-level response reports `entryRiskAmount === 0`; non-zero-risk levels remain blocked. Existing allocated rounds remain readable/continuable. This UI guard does not enforce financial safety against direct API callers. Likith must implement an atomic server-side entry check and debit, with an explicit insufficient-balance response, before non-zero-risk allocation can be enabled.
2. **Backend seed configuration conflicts with the previously approved competition rules.** The latest `seedLevels.js` initializes L1 risk ₹0 / payout ₹50; L2 ₹50 / ₹100; L3 ₹100 / ₹150; L4 ₹150 / ₹250; L5 ₹0 / ₹350; L6 ₹100 / ₹500. It also configures loss payouts and safe-zone amounts. These are configuration values only; this report does not infer net wallet deltas from them. Existing level documents are explicitly not overwritten by the seed script, so runtime values must be read from the API. This does not match the previously approved L1 ₹0 / L2–L6 ₹100 entry and ₹100 pass reward. The product owner and Likith must reconcile the desired rules with backend level configuration before competition entry is opened.
3. **Volunteer roster endpoint is absent.** The backend can retrieve a round only by supplied USN. Volunteer dashboard consequently asks for a USN lookup and shows no fabricated roster/counts. If a roster is needed, Likith must add an authenticated assignment/list route and define its visibility/assignment rules.
4. **Question input/output format fields are absent.** Backend question schema/response currently carries `statement`, `constraints`, `examples`, `difficulty`, `levelNumber` and ID; it does not return separate input/output format fields. Current volunteer/student views render only supplied data.
5. **Round allocation safety affects student flow.** Backend source has been inspected, but the live backend is not running/reachable in this workspace; no live API claim is made.

## Configuration and deployment

### Vite frontend

The root `.env.example` contains placeholders only:

- `VITE_API_BASE_URL`: backend origin, without a route suffix.
- `VITE_GOOGLE_CLIENT_ID`: public Google OAuth Web client ID. Obtain the value from Likith; it must match backend `GOOGLE_CLIENT_ID` and be configured for the deployed frontend origin. Never place a client secret or server signing secret in a `VITE_` value.

Vercel frontend root: repository root (the folder containing root `package.json` and `vite.config.js`). Build command: `npm run build`; output directory: `dist`. Configure SPA fallback so nested React Router paths resolve to `index.html`.

### Express backend

The backend branch uses `backend/` as the Render root directory and has its own package manifest. Start command: `npm start` (`node server.js`). Required server-only variables in `backend/.env.example`: `MONGO_URI`, `JWT_SECRET` (at least 32 characters in production), `GOOGLE_CLIENT_ID`; runtime `PORT` is supported. Production `CORS_ORIGINS` must include the exact Vercel frontend origin(s), comma-separated. Configure `NODE_ENV=production`. Do not expose these values in the frontend.

Do not copy real credentials into either example file or repository. Database connection, Google OAuth origins and CORS must be configured in deployment secret/environment settings by the team.

## Validation status

- Frontend production build: passed (`npm run build`).
- Backend build/live API: not run; backend source is remote-only on `feature/backend` in this workspace.
- Backend `npm test` is a placeholder that exits with an error. The branch defines `npm run test:integration`; it was not run because the backend checkout and its dependencies/database runtime are not available locally.
- Browser/API integration: not live-tested; no configured environment values or reachable backend were supplied.
- No commit, push, merge, branch switch or deployment was performed.
