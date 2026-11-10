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
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some error responses may not include a JSON body.
  }
  return payload;
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

  const payload = await readResponse(response);
  if (!response.ok || payload?.success !== true || !payload?.token || !payload?.admin) {
    if (response.status === 401 || response.status === 400 || response.status === 403) {
      throw Object.assign(new Error("Invalid username or password."), { code: "INVALID_CREDENTIALS" });
    }
    throw Object.assign(
      new Error("The admin server could not complete the login. Please try again."),
      { code: "SERVER_ERROR", status: response.status },
    );
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

  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error("Your admin session has expired. Please sign in again."), { code: "SESSION_EXPIRED" });
  }
  if (!response.ok) {
    throw Object.assign(new Error("The admin session could not be validated."), { code: "SERVER_ERROR", status: response.status });
  }
}
