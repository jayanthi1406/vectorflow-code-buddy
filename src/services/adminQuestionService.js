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
    throw new Error(payload?.message || `The question request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export async function getAdminQuestionList() {
  const payload = await adminRequest("/api/admin/questions");
  if (!Array.isArray(payload.questions)) {
    throw new Error("The question list response is missing a valid questions array.");
  }
  return payload.questions;
}

export async function getAdminQuestions() {
  const questions = await getAdminQuestionList();
  return Promise.all(questions.map(async (question) => {
    const detail = await adminRequest(`/api/admin/questions/${encodeURIComponent(question.id)}`);
    return { ...question, isAssigned: detail.isAssigned === true };
  }));
}

export function createAdminQuestion(question) {
  return adminRequest("/api/admin/questions", {
    method: "POST",
    body: JSON.stringify(question),
  });
}

export function updateAdminQuestion(id, question) {
  return adminRequest(`/api/admin/questions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(question),
  });
}

export function setAdminQuestionActive(id, isActive) {
  const action = isActive ? "reactivate" : "deactivate";
  return adminRequest(`/api/admin/questions/${encodeURIComponent(id)}/${action}`, {
    method: "PATCH",
  });
}
