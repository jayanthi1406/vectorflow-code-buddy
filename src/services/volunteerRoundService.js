import { backendConfig } from "./backendConfig";
import { getVolunteerSession } from "./volunteerAuthService";

class VolunteerApiError extends Error {
  constructor({ message, kind, status, code }) {
    super(message);
    this.name = "VolunteerApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

function apiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw new Error("Volunteer API is not configured. Set VITE_API_BASE_URL and restart the frontend.");
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

async function volunteerRequest(usn, action = "", body) {
  const session = getVolunteerSession();
  if (!session?.token) throw new Error("Your volunteer session is missing. Please sign in again.");
  const suffix = action ? `/${action}` : "";
  const path = `/api/volunteer/students/${encodeURIComponent(usn)}/round${suffix}`;
  const url = apiUrl(path);

  let response;
  try {
    response = await fetch(url, {
      method: action ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new VolunteerApiError({
      message: "Could not reach the server. Check that it is running and try again.",
      kind: "network",
    });
  }

  let payload = null;
  let validJson = false;
  try {
    payload = await response.json();
    validJson = true;
  } catch {
    // Non-JSON responses are handled below using the HTTP status.
  }

  if (
    !response.ok ||
    !validJson ||
    !payload ||
    typeof payload !== "object" ||
    payload.success !== true
  ) {
    const hasBackendError =
      validJson && payload && typeof payload === "object" && payload.success === false;
    const isObjectPayload = validJson && payload && typeof payload === "object";
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : response.status === 401 || response.status === 403
          ? "Your volunteer session is no longer authorized."
          : !response.ok
            ? `The round request failed (HTTP ${response.status}).`
            : "The server returned an invalid response.";
    const kind = !isObjectPayload
      ? response.ok ? "invalid_response" : "http"
      : !response.ok
        ? "http"
        : hasBackendError ? "api" : "invalid_response";

    throw new VolunteerApiError({
      message,
      kind,
      status: response.status,
      code: payload?.code,
    });
  }
  return payload;
}

export function getVolunteerStudentRound(usn) {
  return volunteerRequest(usn);
}

export function startVolunteerStudentRound(usn) {
  return volunteerRequest(usn, "start");
}

export function extendVolunteerStudentRound(usn, { extensionSeconds, reason }) {
  const body = { extensionSeconds };
  if (reason !== undefined) body.reason = reason;
  return volunteerRequest(usn, "extend", body);
}

export function evaluateVolunteerStudentRound(usn, { result, remarks, programmingLanguage }) {
  const body = { result };
  if (remarks !== undefined) body.remarks = remarks;
  if (programmingLanguage !== undefined) body.programmingLanguage = programmingLanguage;
  return volunteerRequest(usn, "evaluate", body);
}

export function settleVolunteerStudentRound(usn) {
  return volunteerRequest(usn, "settle", {});
}

export function progressVolunteerStudentRound(usn) {
  return volunteerRequest(usn, "progress", {});
}
