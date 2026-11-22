import { backendConfig } from "./backendConfig";

const SESSION_KEY = "code-buddy-volunteer-session";

function isVolunteerProfile(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.id === "string" && value.id.trim() &&
    typeof value.name === "string" &&
    typeof value.username === "string" &&
    value.role === "VOLUNTEER" &&
    typeof value.isActive === "boolean",
  );
}

function safeBackendMessage(payload, fallback) {
  if (payload?.success !== false) return fallback;
  const message = payload?.message;
  if (typeof message !== "string" || !message.trim()) return fallback;

  const normalized = message.trim();
  if (/\bat\s+\S+\s*\(/i.test(normalized) || /\n\s*at\s+/i.test(normalized)) {
    return fallback;
  }
  return normalized.slice(0, 500);
}

function authError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

function getApiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw Object.assign(
      new Error("Volunteer API is not configured. Set VITE_API_BASE_URL and restart the frontend."),
      { code: "API_NOT_CONFIGURED" },
    );
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

export function getVolunteerSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return session?.token && session?.volunteer ? session : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function storeVolunteerSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearVolunteerSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function loginVolunteer(username, password) {
  const url = getApiUrl("/api/volunteer/login");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw Object.assign(
      new Error("Could not reach the volunteer server. Check that it is running and try again."),
      { code: "NETWORK_ERROR" },
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Handle non-JSON server responses with the status-based messages below.
  }

  if (response.status === 400) {
    throw Object.assign(new Error("Please enter your username and password."), { code: "MISSING_CREDENTIALS" });
  }
  if (response.status === 401) {
    throw Object.assign(new Error("Invalid username or password."), { code: "INVALID_CREDENTIALS" });
  }
  if (response.status === 403) {
    throw Object.assign(new Error("This volunteer account is deactivated. Contact the competition administrator."), { code: "VOLUNTEER_DEACTIVATED" });
  }
  if (!response.ok || payload?.success !== true || !payload?.token || !payload?.volunteer) {
    throw Object.assign(new Error("The volunteer server could not complete the login. Please try again."), {
      code: "SERVER_ERROR",
      status: response.status,
    });
  }

  const session = { token: payload.token, volunteer: payload.volunteer };
  storeVolunteerSession(session);
  return session;
}

export async function validateVolunteerSession(token) {
  const url = getApiUrl("/api/volunteer/me");
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw Object.assign(new Error("Could not reach the volunteer server."), { code: "NETWORK_ERROR" });
  }

  let payload = null;
  let validJson = false;
  try {
    payload = await response.json();
    validJson = true;
  } catch {
    // Treat malformed session responses as invalid; callers will return to login.
  }

  if (!response.ok) {
    const backendCode = typeof payload?.code === "string" ? payload.code : "";
    const fallback = response.status === 401 || response.status === 403
      ? "Your volunteer session is no longer valid. Please sign in again."
      : "The volunteer session could not be validated. Please retry.";
    const message = safeBackendMessage(payload, fallback);
    if (response.status >= 500) {
      throw authError(message, backendCode || "SERVER_ERROR", response.status);
    }
    throw authError(message, "SESSION_EXPIRED", response.status);
  }

  if (!validJson || payload?.success !== true || !isVolunteerProfile(payload?.volunteer)) {
    throw authError(
      safeBackendMessage(payload, "The volunteer session response was invalid. Please sign in again."),
      "SESSION_EXPIRED",
      response.status,
    );
  }

  return payload.volunteer;
}
