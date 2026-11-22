import { backendConfig } from "./backendConfig";
import { getAdminSession } from "./adminAuthService";

function getApiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw new Error("API is not configured. Set VITE_API_BASE_URL and restart the frontend.");
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

export class AdminVolunteerApiError extends Error {
  constructor(message, { status = null, code = null, kind = "api" } = {}) {
    super(message);
    this.name = "AdminVolunteerApiError";
    this.status = status;
    this.code = code;
    this.kind = kind;
  }
}

async function adminRequest(path, options = {}) {
  const session = getAdminSession();
  if (!session?.token) {
    throw new AdminVolunteerApiError("Your admin session is missing. Please sign in again.", {
      kind: "session",
    });
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
    throw new AdminVolunteerApiError("Could not reach the server. Check your connection and try again.", {
      kind: "network",
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error responses are handled using their HTTP status below.
  }

  if (response.status === 401 || response.status === 403) {
    throw new AdminVolunteerApiError(
      payload?.message || "Your admin session is no longer authorized. Please sign in again.",
      { status: response.status, code: payload?.code || null, kind: "authorization" },
    );
  }
  if (!response.ok || payload?.success !== true) {
    throw new AdminVolunteerApiError(
      payload?.message || `The volunteer request failed (HTTP ${response.status}). Please try again.`,
      { status: response.status, code: payload?.code || null },
    );
  }
  return payload;
}

function validateVolunteer(payload, context = "volunteer response") {
  if (!payload?.volunteer || typeof payload.volunteer !== "object" || Array.isArray(payload.volunteer)) {
    throw new AdminVolunteerApiError(`The ${context} is missing valid volunteer data.`, {
      kind: "response",
    });
  }
  return payload;
}

export async function getAdminVolunteers() {
  const result = await adminRequest("/api/admin/volunteers");
  if (!Array.isArray(result.volunteers)) {
    throw new AdminVolunteerApiError("The volunteer list response is missing a valid volunteers array.", {
      kind: "response",
    });
  }
  return result.volunteers;
}

export async function createAdminVolunteer({ name, username, password, assignedLab }) {
  const payload = await adminRequest("/api/admin/volunteers", {
    method: "POST",
    body: JSON.stringify({ name, username, password, ...(assignedLab ? { assignedLab } : {}) }),
  });
  return validateVolunteer(payload, "create response");
}

export async function getAdminVolunteerDetails(id) {
  const payload = await adminRequest(`/api/admin/volunteers/${encodeURIComponent(id)}`);
  return validateVolunteer(payload, "details response");
}

export async function updateAdminVolunteer(id, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.assignedLab !== undefined) body.assignedLab = fields.assignedLab;
  const payload = await adminRequest(`/api/admin/volunteers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return validateVolunteer(payload, "update response");
}

export async function resetAdminVolunteerPassword(id, password) {
  const payload = await adminRequest(
    `/api/admin/volunteers/${encodeURIComponent(id)}/reset-password`,
    { method: "PATCH", body: JSON.stringify({ newPassword: password }) },
  );
  return validateVolunteer(payload, "password reset response");
}

export async function setAdminVolunteerActive(id, isActive) {
  const action = isActive ? "reactivate" : "deactivate";
  const payload = await adminRequest(`/api/admin/volunteers/${encodeURIComponent(id)}/${action}`, {
    method: "PATCH",
  });
  return validateVolunteer(payload, `${action} response`);
}
