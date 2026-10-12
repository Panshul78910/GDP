// The ONLY place the frontend talks to the backend. Every page calls a function
// from `api` below; nothing else uses fetch().
//
// Security notes (Part D):
//  - The access token lives in this module's memory only: not localStorage, not
//    sessionStorage, so it can't be read back by injected script or survive a tab.
//  - Errors shown to users come from the backend's public error message or a
//    fixed friendly string; raw response bodies are never displayed.

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// `npm run dev:mock` sets VITE_MOCK=true: every request is answered by the in-memory
// mock in src/mock/mockBackend.js instead of the network. No backend needed.
export const MOCK_MODE = import.meta.env.VITE_MOCK === "true";

let token = null;
let sessionDate = null;
let unauthorizedHandler = null;

export const setToken = (t) => {
  token = t;
};
export const setApiSessionDate = (d) => {
  sessionDate = d;
};
export const onUnauthorized = (fn) => {
  unauthorizedHandler = fn;
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", correlationId = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

const FRIENDLY = {
  0: "Can't reach the server. Check your connection and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have access to that.",
  404: "We couldn't find that.",
  409: "That action conflicts with the current state of your account.",
  422: "Some of the values aren't valid. Please check them and try again.",
  429: "The service is busy right now. Please wait a moment and retry.",
  500: "Something went wrong on our side. Please try again.",
  503: "The service is temporarily unavailable. Please try again shortly.",
  504: "The server took too long to respond. Please try again.",
};

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function request(
  path,
  { method = "GET", body, form, query, idempotent = false, timeoutMs = 60000, auth = true } = {}
) {
  if (MOCK_MODE) {
    const { mockRequest, MockHttpError } = await import("./mock/mockBackend.js");
    try {
      return await mockRequest(path, { method, body, form, query, token });
    } catch (e) {
      if (!(e instanceof MockHttpError)) throw e;
      if (e.status === 401 && auth && path !== "/api/auth/login") unauthorizedHandler?.();
      throw new ApiError(e.message, { status: e.status, code: e.code, correlationId: e.correlationId });
    }
  }

  const url = new URL(`${BASE}${path}`, window.location.origin);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (idempotent) headers["Idempotency-Key"] = newKey(); // B.6: a retried POST must not double-trade
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); // B.6: request timeout
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", { code: "timeout" });
    }
    throw new ApiError(FRIENDLY[0], { code: "network" });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && auth && path !== "/api/auth/login") unauthorizedHandler?.();
    throw new ApiError(err?.message || FRIENDLY[res.status] || FRIENDLY[500], {
      status: res.status,
      code: err?.code || "error",
      correlationId: err?.correlationId || res.headers.get("X-Correlation-Id"),
    });
  }
  return data;
}

const dated = (extra = {}) => ({ session_date: sessionDate, ...extra });

export const api = {
  // --- auth + session ------------------------------------------------------
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: () => request("/api/auth/me"),
  getSessionDate: () => request("/api/session/date"),
  setSessionDate: (date) => request("/api/session/date", { method: "POST", body: { sessionDate: date } }),

  // --- A.1 profile ---------------------------------------------------------
  getProfile: () => request("/api/clients/me/profile"),
  updateProfile: (body) => request("/api/clients/me/profile", { method: "PUT", body }),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/api/clients/me/documents", { method: "POST", form });
  },
  listDocuments: () => request("/api/clients/me/documents"),

  // --- A.2 profiling chat --------------------------------------------------
  profilingStart: () => request("/api/profiling/start", { method: "POST" }),
  profilingMessage: (message) => request("/api/profiling/message", { method: "POST", body: { message } }),

  // --- A.3 suitability -----------------------------------------------------
  passCka: () => request("/api/clients/me/cka", { method: "POST" }),
  getEligibility: () => request("/api/clients/me/eligible-portfolios"),

  // --- A.5 / A.6 / A.7 / C.1 ----------------------------------------------
  getHoldings: () => request("/api/clients/me/holdings", { query: dated() }),
  getPerformance: (days = 90) => request("/api/clients/me/performance", { query: dated({ days }) }),
  invest: (portfolioCode) =>
    request("/api/clients/me/invest", { method: "POST", body: { portfolioCode }, query: dated(), idempotent: true }),
  rebalancePreview: () => request("/api/clients/me/rebalance/preview", { query: dated() }),
  rebalance: () => request("/api/clients/me/rebalance", { method: "POST", query: dated(), idempotent: true }),
  revertRebalance: () =>
    request("/api/clients/me/rebalance/revert", { method: "POST", query: dated(), idempotent: true }),
  getEvents: () => request("/api/clients/me/events"),

  // --- chat + client's own audit (C.1-C.6) --------------------------------
  chat: (message, conversationId) =>
    request("/api/chat", {
      method: "POST",
      body: { message, ...(conversationId ? { conversationId } : {}) },
      query: dated(),
    }),
  myAudit: (limit = 100) => request("/api/clients/me/audit", { query: { limit } }),

  // --- admin / officer -----------------------------------------------------
  adminClients: () => request("/api/admin/clients"),
  adminClient: (id) => request(`/api/admin/clients/${encodeURIComponent(id)}`),
  adminEscalations: (status = "pending") => request("/api/admin/escalations", { query: { status } }),
  adminReview: (decisionNo, body) =>
    request(`/api/admin/decisions/${encodeURIComponent(decisionNo)}/review`, { method: "POST", body }),
  adminAudit: (limit = 200) => request("/api/admin/audit", { query: { limit } }),
  ragStats: () => request("/api/admin/rag/stats"),
  ragQuery: (query, topK = 5, audience) =>
    request("/api/admin/rag/query", { method: "POST", body: { query, topK, ...(audience ? { audience } : {}) } }),
  ragIngest: (body) => request("/api/admin/rag/ingest", { method: "POST", body }),
  ragReset: () => request("/api/admin/rag/reset", { method: "POST" }),
  lastPayload: () => request("/api/admin/debug/last-payload"),
};
