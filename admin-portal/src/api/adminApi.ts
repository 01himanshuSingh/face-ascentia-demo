/**
 * Admin Portal API client.
 *
 * Wire contract (camelCase aliases from FastAPI):
 *   POST /admin/login
 *   GET  /admin/registrations/pending          (X-Admin-Session-Token)
 *   GET  /admin/registrations/{id}/image       (X-Admin-Session-Token)
 *   POST /admin/registrations/{id}/approve     (X-Admin-Session-Token)
 *   POST /admin/registrations/{id}/reject      (X-Admin-Session-Token)
 *   POST /admin/users/grant                    (X-Admin-Session-Token)
 *   GET  /admin/users/grant-preview/{employeeId}  (resolve plant from employee)
 * so a refresh keeps the desk admin signed in until the tab closes.
 *
 * Plant scoping is enforced by the backend — this client never filters
 * the queue; PLANT_ADMIN sees own plant, SUPER_ADMIN sees all.
 */

const SESSION_STORAGE_KEY = "faceAuth.adminSession";
const ADMIN_SESSION_HEADER = "X-Admin-Session-Token";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/schemas/admin.py serialization aliases)
// ---------------------------------------------------------------------------

export type AdminSession = {
  adminSessionToken: string;
  employeeId: string;
  role: string;
  plantId: string | null;
  expiresAt: string;
};

/** UI gate for Grant tab — backend enforces permission + plant scope on grant. */
export function canGrantPlantAdmin(session: AdminSession): boolean {
  return (
    session.role === "SUPER_ADMIN" ||
    (session.role === "PLANT_ADMIN" && session.plantId != null)
  );
}

export type AdminGrantPreview = {
  employeeId: string;
  fullName: string;
  plantId: string;
  plantCode: string;
  plantName: string;
  grantEligible: boolean;
};

export type RegistrationQueueItem = {
  requestId: string;
  employeeId: string;
  submittedFullName: string;
  plantId: string;
  plantCode: string | null;
  plantName: string | null;
  status: string;
  source: string;
  capturedAt: string;
};

export type RegistrationDecision = {
  requestId: string;
  employeeId: string;
  status: string;
  message: string;
};

export type PlantListItem = {
  plantId: string;
  plantCode: string;
  plantName: string;
};

export type AdminGrantResult = {
  employeeId: string;
  role: string;
  plantId: string | null;
  message: string;
};

export type AdminGrantPayload = {
  employeeId: string;
  password: string;
};

export type AdminApiError = {
  detail: string;
  code: string;
};

export class AdminApiClientError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(error: AdminApiError, httpStatus: number) {
    super(error.detail);
    this.name = "AdminApiClientError";
    this.code = error.code;
    this.httpStatus = httpStatus;
  }
}

// ---------------------------------------------------------------------------
// Base URL + HTTP helpers
// ---------------------------------------------------------------------------

function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  // Dev default: Vite proxies /api → localhost:8000
  return import.meta.env.DEV ? "/api" : "";
}

async function readError(response: Response): Promise<AdminApiError> {
  try {
    const body = (await response.json()) as Partial<AdminApiError>;
    return {
      detail: body.detail ?? response.statusText ?? "Request failed",
      code: body.code ?? "UNKNOWN",
    };
  } catch {
    return {
      detail: response.statusText || "Request failed",
      code: "UNKNOWN",
    };
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set(ADMIN_SESSION_HEADER, token);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new AdminApiClientError(await readError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Session persistence (tab-scoped)
// ---------------------------------------------------------------------------

export function loadStoredSession(): AdminSession | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const session = JSON.parse(raw) as AdminSession;
    if (!session.adminSessionToken || !session.employeeId) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: AdminSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** POST /admin/login — Employee ID + password → session token. */
export async function login(
  employeeId: string,
  password: string,
): Promise<AdminSession> {
  const session = await requestJson<AdminSession>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ employeeId, password }),
  });
  saveSession(session);
  return session;
}

/** GET /admin/registrations/pending — plant-scoped by backend session. */
export async function listPending(
  token: string,
): Promise<RegistrationQueueItem[]> {
  const body = await requestJson<{ items: RegistrationQueueItem[] }>(
    "/admin/registrations/pending",
    { method: "GET" },
    token,
  );
  return body.items;
}

/**
 * GET /admin/registrations/{id}/image
 * Returns an object URL — caller must revoke with URL.revokeObjectURL when done.
 */
export async function fetchRegistrationImage(
  token: string,
  requestId: string,
): Promise<string> {
  const headers = new Headers();
  headers.set(ADMIN_SESSION_HEADER, token);

  const response = await fetch(
    `${getApiBaseUrl()}/admin/registrations/${requestId}/image`,
    { method: "GET", headers },
  );

  if (!response.ok) {
    throw new AdminApiClientError(await readError(response), response.status);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** POST /admin/registrations/{id}/approve — creates employee + ACTIVE enrollment. */
export async function approveRegistration(
  token: string,
  requestId: string,
  reason?: string,
): Promise<RegistrationDecision> {
  return requestJson<RegistrationDecision>(
    `/admin/registrations/${requestId}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ reason: reason?.trim() || null }),
    },
    token,
  );
}

/** POST /admin/registrations/{id}/reject — reason required by backend. */
export async function rejectRegistration(
  token: string,
  requestId: string,
  reason: string,
): Promise<RegistrationDecision> {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new AdminApiClientError(
      {
        detail: "Reject reason is required.",
        code: "MISSING_DECISION_REASON",
      },
      400,
    );
  }

  return requestJson<RegistrationDecision>(
    `/admin/registrations/${requestId}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ reason: trimmed }),
    },
    token,
  );
}

/** GET /admin/users/grant-preview/{employeeId} — plant derived from employee row. */
export async function previewGrantTarget(
  token: string,
  employeeId: string,
): Promise<AdminGrantPreview> {
  const normalized = employeeId.trim();
  if (!normalized) {
    throw new AdminApiClientError(
      {
        detail: "Employee ID is required.",
        code: "INVALID_CREDENTIALS",
      },
      400,
    );
  }

  return requestJson<AdminGrantPreview>(
    `/admin/users/grant-preview/${encodeURIComponent(normalized)}`,
    { method: "GET" },
    token,
  );
}

/**
 * POST /admin/users/grant — grant PLANT_ADMIN to an existing employee.
 * Plant is derived server-side from employees.plant_id (omit plantId).
 */
export async function grantPlantAdmin(
  token: string,
  payload: AdminGrantPayload,
): Promise<AdminGrantResult> {
  const employeeId = payload.employeeId.trim();
  const password = payload.password;

  if (!employeeId || !password) {
    throw new AdminApiClientError(
      {
        detail: "Employee ID and password are required.",
        code: "INVALID_CREDENTIALS",
      },
      400,
    );
  }

  return requestJson<AdminGrantResult>(
    "/admin/users/grant",
    {
      method: "POST",
      body: JSON.stringify({
        employeeId,
        role: "PLANT_ADMIN",
        password,
      }),
    },
    token,
  );
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function isAdminApiError(error: unknown): error is AdminApiClientError {
  return error instanceof AdminApiClientError;
}
