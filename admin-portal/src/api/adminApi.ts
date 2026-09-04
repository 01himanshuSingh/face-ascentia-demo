/**
 * Admin Portal API client.
 *
 * Wire contract (camelCase aliases from FastAPI):
 *   POST /admin/login
 *   GET  /admin/registrations/pending?plantId=  (active plant workspace)
 *   GET  /admin/registrations/{id}/image
 *   POST /admin/registrations/{id}/approve
 *   POST /admin/registrations/{id}/reject
 *   GET  /admin/users?plantId=&q=              (plant admin roster — SUPER)
 *   POST /admin/users/{employeeId}/revoke      (soft-ungrant in workspace)
 *   POST /admin/users/grant
 *   GET  /admin/users/grant-preview/{employeeId}
 *   GET  /plants                               (active only — workspace selector / kiosk)
 *   GET  /admin/plants                         (catalog incl. inactive — PLANTS_MANAGE)
 *   POST /admin/plants                         (create)
 *   GET  /admin/audit?plantId=&category=&q=&cursor=  (AUDIT_VIEW; text only)
 *
 * Plant layers (do not merge)
 * ---------------------------
 *   A) Workspace lens — which plant am I working in? (sessionStorage + GET /plants)
 *   B) Plant catalog  — create / update / soft-deactivate (GET/POST/PATCH /admin/plants)
 *   C) Plant admins   — list/search/ungrant in workspace (GET/POST /admin/users*)
 *   D) Audit log      — plant-scoped keyset timeline (GET /admin/audit)
 *
 * Pending queue follows active plant workspace (not client-side row filter):
 *   PLANT_ADMIN — session.plantId (fixed)
 *   SUPER_ADMIN — selectedPlantId from portal storage → ?plantId=
 *
 * Backend enforces RBAC on every API call. Portal tabs gate on
 * ``session.permissions`` returned at login (e.g. PLANTS_MANAGE → Plants tab).
 * Grant plant remains derived from the employee row.
 */

const SESSION_STORAGE_KEY = "faceAuth.adminSession";
/** SUPER active plant workspace — tab-scoped; does not rewrite admin_roles. */
const WORKSPACE_PLANT_STORAGE_KEY = "faceAuth.adminWorkspacePlantId";
const ADMIN_SESSION_HEADER = "X-Admin-Session-Token";

/**
 * Permission codes mirrored from backend AdminPermissionCode.
 * Portal tabs/features gate on session.permissions — not role name.
 * Backend still enforces the same codes on every API call.
 */
export const AdminPermission = {
  REGISTRATION_VIEW_PENDING: "REGISTRATION_VIEW_PENDING",
  REGISTRATION_VIEW_IMAGE: "REGISTRATION_VIEW_IMAGE",
  REGISTRATION_APPROVE: "REGISTRATION_APPROVE",
  REGISTRATION_REJECT: "REGISTRATION_REJECT",
  ADMIN_GRANT_PLANT_ADMIN: "ADMIN_GRANT_PLANT_ADMIN",
  PLANTS_MANAGE: "PLANTS_MANAGE",
  AUDIT_VIEW: "AUDIT_VIEW",
} as const;

export type AdminPermissionCode =
  (typeof AdminPermission)[keyof typeof AdminPermission];

// ---------------------------------------------------------------------------
// Types (mirror backend/app/schemas/admin.py serialization aliases)
// ---------------------------------------------------------------------------

export type AdminSession = {
  adminSessionToken: string;
  employeeId: string;
  role: string;
  plantId: string | null;
  expiresAt: string;
  /** Effective codes from admin_role_permissions (returned at login). */
  permissions: string[];
};

/** True when session carries the given permission code. */
export function hasPermission(
  session: AdminSession,
  code: AdminPermissionCode | string,
): boolean {
  return session.permissions.includes(code);
}

/**
 * UI gate for Grant tab — show when ADMIN_GRANT_PLANT_ADMIN is present.
 * Backend still enforces permission + plant scope on grant.
 */
export function canGrantPlantAdmin(session: AdminSession): boolean {
  return hasPermission(session, AdminPermission.ADMIN_GRANT_PLANT_ADMIN);
}

export function isSuperAdmin(session: AdminSession): boolean {
  return session.role === "SUPER_ADMIN";
}

/**
 * UI gate for Plants catalog tab — show when PLANTS_MANAGE is present.
 * Role-agnostic: any admin granted this permission sees the tab.
 * Backend still enforces PLANTS_MANAGE + plant scope on catalog APIs.
 */
export function canManagePlants(session: AdminSession): boolean {
  return hasPermission(session, AdminPermission.PLANTS_MANAGE);
}

/**
 * Create / soft-deactivate plant workspaces — global catalog only
 * (session.plantId == null, typically SUPER). Plant-scoped admins may
 * read/update their own plant but cannot create another workspace.
 */
export function canCreatePlants(session: AdminSession): boolean {
  return canManagePlants(session) && session.plantId == null;
}

export function canDeactivatePlants(session: AdminSession): boolean {
  return canCreatePlants(session);
}

/**
 * UI gate for Plant admins tab (list + ungrant).
 * v1: global session (plantId null) + ADMIN_GRANT_PLANT_ADMIN — SUPER only.
 * Plant admins cannot ungrant peers. Backend still enforces.
 */
export function canRevokePlantAdmins(session: AdminSession): boolean {
  return (
    session.plantId == null &&
    hasPermission(session, AdminPermission.ADMIN_GRANT_PLANT_ADMIN)
  );
}

/**
 * UI gate for Audit log tab — plant-scoped timeline (no images in list).
 * Backend still enforces AUDIT_VIEW + plant scope on GET /admin/audit.
 */
export function canViewAudit(session: AdminSession): boolean {
  return hasPermission(session, AdminPermission.AUDIT_VIEW);
}

/** Face peek in APPROVE/kiosk audit dialog — separate from AUDIT_VIEW. */
export function canViewAuditEnrollmentImage(session: AdminSession): boolean {
  return hasPermission(session, AdminPermission.REGISTRATION_VIEW_IMAGE);
}

/**
 * Resolve plantId for pending (and later grant search).
 * SUPER: portal workspace selection. PLANT_ADMIN: session.plantId only.
 */
export function resolveWorkspacePlantId(
  session: AdminSession,
  selectedPlantId: string | null,
): string | null {
  if (isSuperAdmin(session)) {
    return selectedPlantId;
  }
  return session.plantId;
}

export type AdminGrantPreview = {
  employeeId: string;
  fullName: string;
  plantId: string;
  plantCode: string;
  plantName: string;
  grantEligible: boolean;
  existingAdminRole: string | null;
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

/** Active plant — public GET /plants (workspace selector / kiosk). */
export type PlantListItem = {
  plantId: string;
  plantCode: string;
  plantName: string;
};

/** Full plant row — GET /admin/plants catalog (includes lifecycle). */
export type AdminPlantItem = {
  plantId: string;
  plantCode: string;
  plantName: string;
  isActive: boolean;
  createdAt: string;
};

export type PlantCreatePayload = {
  plantCode: string;
  plantName: string;
};

/** Partial update — omit fields you do not change. isActive=false soft-deactivates. */
export type PlantUpdatePayload = {
  plantCode?: string;
  plantName?: string;
  isActive?: boolean;
};

export type PlantMutationResult = {
  plant: AdminPlantItem;
  message: string;
};

export type AdminGrantResult = {
  employeeId: string;
  role: string;
  plantId: string | null;
  message: string;
};

/** Active plant-scoped admin for SUPER roster. */
export type AdminUserItem = {
  employeeId: string;
  fullName: string;
  role: string;
  plantId: string;
  grantedBy: string | null;
  createdAt: string;
};

/** Portal category chips → GET /admin/audit?category= */
export type AuditCategory =
  | "all"
  | "approved"
  | "rejected"
  | "admins"
  | "kiosk"
  | "plants";

export type AuditLogItem = {
  logId: string;
  createdAt: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  plantId: string;
  metadata: Record<string, unknown> | null;
};

export type AuditLogListResult = {
  items: AuditLogItem[];
  plantId: string;
  nextCursor: string | null;
};

export type AdminUserListResult = {
  items: AdminUserItem[];
  total: number;
  plantId: string;
};

export type AdminRevokeResult = {
  employeeId: string;
  role: string;
  plantId: string;
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
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (!parsed.adminSessionToken || !parsed.employeeId) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    // Older sessions without permissions must re-login for permission-gated tabs.
    const permissions = Array.isArray(parsed.permissions)
      ? parsed.permissions.filter((code): code is string => typeof code === "string")
      : [];
    return {
      adminSessionToken: parsed.adminSessionToken,
      employeeId: parsed.employeeId,
      role: typeof parsed.role === "string" ? parsed.role : "",
      plantId:
        typeof parsed.plantId === "string" || parsed.plantId === null
          ? parsed.plantId
          : null,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : "",
      permissions,
    };
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
  clearWorkspacePlantId();
}

// ---------------------------------------------------------------------------
// SUPER plant workspace persistence (view lens only — not admin_roles)
// ---------------------------------------------------------------------------

export function loadWorkspacePlantId(): string | null {
  const raw = sessionStorage.getItem(WORKSPACE_PLANT_STORAGE_KEY);
  if (!raw || !raw.trim()) {
    return null;
  }
  return raw.trim();
}

export function saveWorkspacePlantId(plantId: string | null): void {
  if (!plantId) {
    sessionStorage.removeItem(WORKSPACE_PLANT_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(WORKSPACE_PLANT_STORAGE_KEY, plantId);
}

export function clearWorkspacePlantId(): void {
  sessionStorage.removeItem(WORKSPACE_PLANT_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** POST /admin/login — Employee ID + password → session token + permissions. */
export async function login(
  employeeId: string,
  password: string,
): Promise<AdminSession> {
  const raw = await requestJson<Partial<AdminSession>>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ employeeId, password }),
  });
  const session: AdminSession = {
    adminSessionToken: raw.adminSessionToken ?? "",
    employeeId: raw.employeeId ?? "",
    role: raw.role ?? "",
    plantId: raw.plantId ?? null,
    expiresAt: raw.expiresAt ?? "",
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
  };
  if (!session.adminSessionToken || !session.employeeId) {
    throw new AdminApiClientError(
      {
        detail: "Login response missing session token.",
        code: "INVALID_CREDENTIALS",
      },
      500,
    );
  }
  saveSession(session);
  return session;
}

/**
 * GET /admin/registrations/pending[?plantId=]
 * Pass active plant workspace for SUPER; PLANT_ADMIN may omit (backend uses session).
 */
export async function listPending(
  token: string,
  plantId?: string | null,
): Promise<RegistrationQueueItem[]> {
  const params = new URLSearchParams();
  const trimmed = plantId?.trim();
  if (trimmed) {
    params.set("plantId", trimmed);
  }
  const query = params.toString();
  const path = query
    ? `/admin/registrations/pending?${query}`
    : "/admin/registrations/pending";

  const body = await requestJson<{ items: RegistrationQueueItem[] }>(
    path,
    { method: "GET" },
    token,
  );
  return body.items;
}

/** GET /plants — active plants for SUPER workspace selector (and kiosk Path A). */
export async function listPlants(): Promise<PlantListItem[]> {
  const body = await requestJson<{ plants: PlantListItem[] }>("/plants", {
    method: "GET",
  });
  return body.plants;
}

// ---------------------------------------------------------------------------
// Plant catalog (Layer B — PLANTS_MANAGE; soft-deactivate only)
// ---------------------------------------------------------------------------

/** GET /admin/plants — full catalog including inactive. */
export async function listAdminPlants(token: string): Promise<AdminPlantItem[]> {
  const body = await requestJson<{ plants: AdminPlantItem[] }>(
    "/admin/plants",
    { method: "GET" },
    token,
  );
  return body.plants;
}

/** POST /admin/plants — create active plant (unique plantCode). */
export async function createPlant(
  token: string,
  payload: PlantCreatePayload,
): Promise<PlantMutationResult> {
  const plantCode = payload.plantCode.trim().toUpperCase();
  const plantName = payload.plantName.trim();

  if (!plantCode || !plantName) {
    throw new AdminApiClientError(
      {
        detail: "Plant code and plant name are required.",
        code: "INVALID_CREDENTIALS",
      },
      400,
    );
  }

  return requestJson<PlantMutationResult>(
    "/admin/plants",
    {
      method: "POST",
      body: JSON.stringify({ plantCode, plantName }),
    },
    token,
  );
}

/**
 * PATCH /admin/plants/{plantId} — rename, change code, soft-deactivate, or reactivate.
 * Soft-deactivate keeps dependent FKs; plant drops from public GET /plants.
 */
export async function updatePlant(
  token: string,
  plantId: string,
  payload: PlantUpdatePayload,
): Promise<PlantMutationResult> {
  const trimmedId = plantId.trim();
  if (!trimmedId) {
    throw new AdminApiClientError(
      {
        detail: "plantId is required.",
        code: "PLANT_NOT_FOUND",
      },
      400,
    );
  }

  const body: Record<string, string | boolean> = {};
  if (payload.plantCode !== undefined) {
    const plantCode = payload.plantCode.trim().toUpperCase();
    if (!plantCode) {
      throw new AdminApiClientError(
        {
          detail: "plantCode cannot be blank.",
          code: "INVALID_CREDENTIALS",
        },
        400,
      );
    }
    body.plantCode = plantCode;
  }
  if (payload.plantName !== undefined) {
    const plantName = payload.plantName.trim();
    if (!plantName) {
      throw new AdminApiClientError(
        {
          detail: "plantName cannot be blank.",
          code: "INVALID_CREDENTIALS",
        },
        400,
      );
    }
    body.plantName = plantName;
  }
  if (payload.isActive !== undefined) {
    body.isActive = payload.isActive;
  }

  if (Object.keys(body).length === 0) {
    throw new AdminApiClientError(
      {
        detail: "At least one of plantCode, plantName, or isActive is required.",
        code: "INVALID_CREDENTIALS",
      },
      400,
    );
  }

  return requestJson<PlantMutationResult>(
    `/admin/plants/${encodeURIComponent(trimmedId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    token,
  );
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
// Plant admin roster + revoke (Layer C — workspace plantId; v1 SUPER)
// ---------------------------------------------------------------------------

/** GET /admin/users?plantId=&q= — active PLANT_ADMINs in workspace. */
export async function listPlantAdmins(
  token: string,
  plantId: string,
  options?: { q?: string; limit?: number; offset?: number },
): Promise<AdminUserListResult> {
  const trimmedPlant = plantId.trim();
  if (!trimmedPlant) {
    throw new AdminApiClientError(
      {
        detail: "plantId is required.",
        code: "PLANT_ACCESS_DENIED",
      },
      400,
    );
  }

  const params = new URLSearchParams();
  params.set("plantId", trimmedPlant);
  const q = options?.q?.trim();
  if (q) {
    params.set("q", q);
  }
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset != null) {
    params.set("offset", String(options.offset));
  }

  return requestJson<AdminUserListResult>(
    `/admin/users?${params.toString()}`,
    { method: "GET" },
    token,
  );
}

/**
 * POST /admin/users/{employeeId}/revoke — soft-ungrant in workspace.
 * Employee + face enrollment stay; portal login stops.
 */
export async function revokePlantAdmin(
  token: string,
  employeeId: string,
  plantId: string,
  reason?: string,
): Promise<AdminRevokeResult> {
  const normalizedId = employeeId.trim();
  const trimmedPlant = plantId.trim();
  if (!normalizedId || !trimmedPlant) {
    throw new AdminApiClientError(
      {
        detail: "employeeId and plantId are required.",
        code: "INVALID_CREDENTIALS",
      },
      400,
    );
  }

  return requestJson<AdminRevokeResult>(
    `/admin/users/${encodeURIComponent(normalizedId)}/revoke`,
    {
      method: "POST",
      body: JSON.stringify({
        plantId: trimmedPlant,
        reason: reason?.trim() || null,
      }),
    },
    token,
  );
}

// ---------------------------------------------------------------------------
// Audit log (Layer D — plant workspace; text timeline; keyset cursor)
// ---------------------------------------------------------------------------

/**
 * GET /admin/audit — plant-scoped compliance feed (no images in payload).
 * Face peek for APPROVE/kiosk uses fetchRegistrationImage(requestId) separately.
 */
export async function listAuditLogs(
  token: string,
  plantId: string,
  options?: {
    category?: AuditCategory;
    q?: string;
    limit?: number;
    cursor?: string | null;
    from?: string;
    to?: string;
  },
): Promise<AuditLogListResult> {
  const trimmedPlant = plantId.trim();
  if (!trimmedPlant) {
    throw new AdminApiClientError(
      {
        detail: "plantId is required.",
        code: "PLANT_ACCESS_DENIED",
      },
      400,
    );
  }

  const params = new URLSearchParams();
  params.set("plantId", trimmedPlant);
  if (options?.category) {
    params.set("category", options.category);
  }
  const q = options?.q?.trim();
  if (q) {
    params.set("q", q);
  }
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }
  if (options?.from) {
    params.set("from", options.from);
  }
  if (options?.to) {
    params.set("to", options.to);
  }

  return requestJson<AuditLogListResult>(
    `/admin/audit?${params.toString()}`,
    { method: "GET" },
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
