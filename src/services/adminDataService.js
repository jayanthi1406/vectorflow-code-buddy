import { backendConfig } from "./backendConfig";
import { getAdminSession } from "./adminAuthService";

function apiUrl(path) {
  if (!backendConfig.apiBaseUrl) {
    throw new Error("Admin API is not configured. Set VITE_API_BASE_URL and restart the frontend.");
  }
  return `${backendConfig.apiBaseUrl}${path}`;
}

export class AdminDataApiError extends Error {
  constructor(message, { status = null, code = null, kind = "api" } = {}) {
    super(message);
    this.name = "AdminDataApiError";
    this.status = status;
    this.code = code;
    this.kind = kind;
  }
}

async function adminRequest(path, options = {}) {
  const session = getAdminSession();
  if (!session?.token) {
    throw new AdminDataApiError("Your admin session is missing. Please sign in again.", { kind: "session" });
  }

  let response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${session.token}`,
      },
    });
  } catch {
    throw new AdminDataApiError("Could not reach the server. Check that it is running and try again.", {
      kind: "network",
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the HTTP status as the useful error when a response is not JSON.
  }
  if (response.status === 401 || response.status === 403) {
    throw new AdminDataApiError(
      payload?.message || "Your admin session is no longer authorized. Please sign in again.",
      { status: response.status, code: payload?.code || null, kind: "authorization" },
    );
  }
  if (!response.ok || payload?.success !== true) {
    throw new AdminDataApiError(
      payload?.message || `The admin request failed (HTTP ${response.status}).`,
      { status: response.status, code: payload?.code || null },
    );
  }
  return payload;
}

export async function getAdminDashboardStats() {
  const payload = await adminRequest("/api/admin/dashboard");
  if (!payload.dashboard || typeof payload.dashboard !== "object") {
    throw new Error("The admin dashboard response is missing dashboard statistics.");
  }
  return payload.dashboard;
}

async function getPaginatedCollection(path, collectionName) {
  const results = [];
  let page = 1;
  let totalPages = 1;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await adminRequest(`${path}${separator}page=${page}&limit=100`);
    if (!Array.isArray(payload[collectionName])) {
      throw new Error(`The admin response is missing a valid ${collectionName} array.`);
    }
    results.push(...payload[collectionName]);
    totalPages = Number(payload.pagination?.totalPages) || 1;
    page += 1;
  } while (page <= totalPages);
  return results;
}

export function getAdminParticipants({ search = "" } = {}) {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return getPaginatedCollection(`/api/admin/participants${query}`, "participants");
}

export async function getAdminParticipantDetails(identifier) {
  const payload = await adminRequest(`/api/admin/participants/${encodeURIComponent(identifier)}`);
  if (!payload.participant || typeof payload.participant !== "object") {
    throw new Error("The participant details response is missing participant data.");
  }
  return payload;
}

function buildQueryString(parameters) {
  const query = new URLSearchParams();
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

function validateParticipantHistoryResponse(payload, collectionName) {
  if (
    !payload.participant ||
    typeof payload.participant !== "object" ||
    Array.isArray(payload.participant)
  ) {
    throw new Error("The participant history response is missing participant data.");
  }
  if (!Array.isArray(payload[collectionName])) {
    throw new Error(`The participant history response is missing ${collectionName}.`);
  }
  if (
    !payload.pagination ||
    typeof payload.pagination !== "object" ||
    Array.isArray(payload.pagination)
  ) {
    throw new Error("The participant history response is missing pagination data.");
  }
  return payload;
}

export async function getAdminParticipantRounds(
  identifier,
  { page = 1, limit = 20, levelNumber, status } = {},
) {
  const query = buildQueryString({ page, limit, levelNumber, status });
  const payload = await adminRequest(
    `/api/admin/participants/${encodeURIComponent(identifier)}/rounds?${query}`,
  );
  return validateParticipantHistoryResponse(payload, "rounds");
}

export async function getAdminParticipantTransactions(
  identifier,
  { page = 1, limit = 20, type, levelNumber } = {},
) {
  const query = buildQueryString({ page, limit, type, levelNumber });
  const payload = await adminRequest(
    `/api/admin/participants/${encodeURIComponent(identifier)}/transactions?${query}`,
  );
  return validateParticipantHistoryResponse(payload, "transactions");
}

export async function getAdminRounds({
  page = 1,
  limit = 20,
  levelNumber,
  status,
  evaluationStatus,
  usn,
  search,
} = {}) {
  const query = buildQueryString({ page, limit, levelNumber, status, evaluationStatus, usn, search });
  const payload = await adminRequest(`/api/admin/rounds?${query}`);
  const pagination = payload.pagination;
  const validPagination = pagination &&
    typeof pagination === "object" &&
    !Array.isArray(pagination) &&
    Number.isInteger(pagination.page) &&
    pagination.page >= 1 &&
    Number.isInteger(pagination.limit) &&
    pagination.limit >= 1 &&
    pagination.limit <= 100 &&
    Number.isInteger(pagination.totalItems) &&
    pagination.totalItems >= 0 &&
    Number.isInteger(pagination.totalPages) &&
    pagination.totalPages >= 0 &&
    typeof pagination.hasNextPage === "boolean" &&
    typeof pagination.hasPrevPage === "boolean";

  if (!Array.isArray(payload.rounds) || !validPagination) {
    throw new AdminDataApiError("The admin rounds response is missing a valid rounds array or pagination data.", {
      status: null,
      code: null,
      kind: "response",
    });
  }
  return payload;
}

export async function recoverAdminRound(roundId) {
  const payload = await adminRequest(
    `/api/admin/rounds/${encodeURIComponent(roundId)}/recover`,
    { method: "POST" },
  );
  const round = payload.round;
  if (
    !round ||
    typeof round !== "object" ||
    Array.isArray(round) ||
    typeof round.id !== "string" ||
    round.id.length === 0 ||
    round.status !== "ready"
  ) {
    throw new AdminDataApiError("The admin recovery response is missing a valid recovered round.", {
      kind: "response",
    });
  }
  return payload;
}

export async function getAdminTransactions({
  page = 1,
  limit = 20,
  type,
  levelNumber,
  usn,
  search,
} = {}) {
  const query = buildQueryString({ page, limit, type, levelNumber, usn, search });
  const payload = await adminRequest(`/api/admin/transactions?${query}`);
  const pagination = payload.pagination;
  const validPagination = pagination &&
    typeof pagination === "object" &&
    !Array.isArray(pagination) &&
    Number.isInteger(pagination.page) &&
    pagination.page >= 1 &&
    Number.isInteger(pagination.limit) &&
    pagination.limit >= 1 &&
    pagination.limit <= 100 &&
    Number.isInteger(pagination.totalItems) &&
    pagination.totalItems >= 0 &&
    Number.isInteger(pagination.totalPages) &&
    pagination.totalPages >= 0 &&
    typeof pagination.hasNextPage === "boolean" &&
    typeof pagination.hasPrevPage === "boolean";

  if (
    typeof payload.message !== "string" ||
    !Number.isInteger(payload.count) ||
    payload.count < 0 ||
    !Array.isArray(payload.transactions) ||
    !validPagination
  ) {
    throw new AdminDataApiError(
      "The admin transactions response is missing valid transaction or pagination data.",
      { kind: "response" },
    );
  }
  return payload;
}
