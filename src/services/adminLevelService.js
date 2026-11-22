import { backendConfig } from "./backendConfig";
import { getAdminSession } from "./adminAuthService";

function apiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw new Error("Admin API is not configured. Set VITE_API_BASE_URL and restart the frontend.");
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

async function adminRequest(path, options = {}) {
  const session = getAdminSession();
  if (!session?.token) throw new Error("Your admin session is missing. Please sign in again.");

  let response;
  try {
    response = await fetch(apiUrl(path), {
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

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Use the HTTP status when the server does not return JSON.
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(payload?.message || "Your admin session is no longer authorized. Please sign in again.");
  }
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.message || `The level request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export async function getAdminLevels() {
  const payload = await adminRequest("/api/admin/levels");
  if (!Array.isArray(payload.levels)) {
    throw new Error("The levels response is missing a valid levels array.");
  }
  return payload.levels;
}

export function updateAdminLevel(number, updates) {
  return adminRequest(`/api/admin/levels/${encodeURIComponent(number)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function setAdminLevelActive(number, isActive) {
  const action = isActive ? "activate" : "deactivate";
  return adminRequest(`/api/admin/levels/${encodeURIComponent(number)}/${action}`, {
    method: "PATCH",
  });
}
