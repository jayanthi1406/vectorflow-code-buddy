import { backendConfig } from "./backendConfig";

const SESSION_KEY = "code-buddy-admin-session";

function getApiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw Object.assign(
      new Error("Admin API is not configured. Set VITE_API_BASE_URL and restart the frontend."),
      { code: "API_NOT_CONFIGURED" },
    );
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

async function readResponse(response) {
  try {
    return { payload: await response.json(), validJson: true };
  } catch {
    return { payload: null, validJson: false };
  }
}

function isAdminProfile(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.id === "string" && value.id.trim() &&
    typeof value.name === "string" &&
    typeof value.username === "string" &&
    value.role === "ADMIN" &&
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

export function getAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return session?.token && session?.admin ? session : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function storeAdminSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function loginAdmin(username, password) {
  const url = getApiUrl("/api/admin/login");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw Object.assign(
      new Error("Could not reach the admin server. Check that it is running and try again."),
      { code: "NETWORK_ERROR" },
    );
  }

  const { payload, validJson } = await readResponse(response);
  if (!response.ok || payload?.success !== true || !payload?.token || !payload?.admin) {
    const backendCode = typeof payload?.code === "string" ? payload.code : "";
    const knownLoginErrors = {
      MISSING_CREDENTIALS: "Please enter your username and password.",
      INVALID_CREDENTIALS: "Invalid username or password.",
      ACCOUNT_DEACTIVATED: "This admin account is deactivated. Contact the competition administrator.",
    };
    if (knownLoginErrors[backendCode]) {
      throw authError(
        safeBackendMessage(payload, knownLoginErrors[backendCode]),
        backendCode,
        response.status,
      );
    }
    const fallback = !validJson || !response.ok
      ? "The admin server could not complete the login. Please try again."
      : "The admin server returned an invalid login response.";
    throw authError(
      safeBackendMessage(payload, fallback),
      backendCode || (response.ok ? "INVALID_RESPONSE" : "LOGIN_FAILED"),
      response.status,
    );
  }
  if (!isAdminProfile(payload.admin) || typeof payload.token !== "string" || !payload.token.trim()) {
    throw authError("The admin server returned an invalid login response.", "INVALID_RESPONSE", response.status);
  }

  const session = { token: payload.token, admin: payload.admin };
  storeAdminSession(session);
  return session;
}

export async function validateAdminSession(token) {
  const url = getApiUrl("/api/admin/me");
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw Object.assign(new Error("Could not reach the admin server."), { code: "NETWORK_ERROR" });
  }

  const { payload, validJson } = await readResponse(response);
  if (!response.ok) {
    const backendCode = typeof payload?.code === "string" ? payload.code : "";
    const message = safeBackendMessage(
      payload,
      response.status === 401 || response.status === 403
        ? "Your admin session is invalid or has expired. Please sign in again."
        : "The admin session could not be validated. Please retry.",
    );
    if (response.status >= 500) {
      throw authError(message, backendCode || "SERVER_ERROR", response.status);
    }
    throw authError(message, "SESSION_EXPIRED", response.status);
  }

  if (!validJson || payload?.success !== true || !isAdminProfile(payload?.admin)) {
    throw authError(
      safeBackendMessage(payload, "The admin session response was invalid. Please sign in again."),
      "SESSION_EXPIRED",
      response.status,
    );
  }

  return payload.admin;
}
