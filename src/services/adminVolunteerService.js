import { backendConfig } from "./backendConfig";
import { getAdminSession } from "./adminAuthService";

function getApiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw new Error("API is not configured. Set VITE_API_BASE_URL and restart the frontend.");
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

async function adminRequest(path, options = {}) {
  const session = getAdminSession();
  if (!session?.token) {
    throw new Error("Your admin session is missing. Please sign in again.");
  }

  let response;
  try {
    response = await fetch(getApiUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the server. Check that it is running and try again.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Your admin session is no longer authorized. Please sign in again.");
  }
  if (!response.ok) {
    throw new Error(`The volunteer request failed (HTTP ${response.status}). Please try again.`);
  }
  if (response.status === 204) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function getAdminVolunteers() {
  const result = await adminRequest("/api/admin/volunteers");
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("The volunteer list response has an unexpected format.");
  }
  if (result.success !== true) {
    throw new Error("The server reported that loading volunteers was unsuccessful.");
  }
  if (!Array.isArray(result.volunteers)) {
    throw new Error("The volunteer list response is missing a valid volunteers array.");
  }
  return result.volunteers;
}

export function createAdminVolunteer({ name, username, password, assignedLab }) {
  return adminRequest("/api/admin/volunteers", {
    method: "POST",
    body: JSON.stringify({ name, username, password, assignedLab }),
  });
}

export function setAdminVolunteerActive(id, isActive) {
  const action = isActive ? "reactivate" : "deactivate";
  return adminRequest(`/api/admin/volunteers/${encodeURIComponent(id)}/${action}`, {
    method: "PATCH",
  });
}
