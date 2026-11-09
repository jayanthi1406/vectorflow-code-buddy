# Student authentication setup

The student client uses the authentication routes verified in the current `feature/backend` implementation:

- `POST /api/auth/google` with `{ "idToken": "<Google Identity Services ID token>" }`.
- `POST /api/auth/register` with `{ "usn": "...", "year": "1st Year" }` (or `2nd Year`, `3rd Year`, `4th Year`). This request is Bearer-token protected.
- `GET /api/auth/me`, Bearer-token protected.

Google ID tokens are verified by the backend. The browser does not decode or accept token claims as proof of identity. The backend checks the configured Google audience, verified email, and `@vvce.ac.in` domain. The Google response returns the backend JWT and the student registration state. The browser then loads the canonical student profile from `/api/auth/me`.

## Local environment configuration

Set these public frontend build variables in a local `.env` file (do not commit that file):

```dotenv
VITE_API_BASE_URL=
VITE_GOOGLE_CLIENT_ID=
```

Obtain the actual reachable backend origin from Likith for `VITE_API_BASE_URL`. Obtain the Google OAuth **Web client ID** used by the project from Likith for `VITE_GOOGLE_CLIENT_ID`; it must match the backend's `GOOGLE_CLIENT_ID`. No values are included here because they are environment-specific and have not been supplied. The backend signing secret (for example `JWT_SECRET`) must remain server-side and must never use a `VITE_` prefix.

The returned JWT is held by the API client's in-memory token provider and stored in `sessionStorage` so a page refresh within the same browser tab can restore the session. A non-secret real-session marker is also kept to prevent an expired real session from silently loading demo data. Sign-out clears this session. Demo sign-in remains an explicit, separate local flow.

## Current integration boundary

Authentication and registration are connected. Competition progression, round, question, timer, evaluation, wallet mutation, and competition-record endpoints are not connected by this phase. Authenticated pages therefore display backend profile values only and mark those other capabilities unavailable; they do not substitute demo records or round content.
