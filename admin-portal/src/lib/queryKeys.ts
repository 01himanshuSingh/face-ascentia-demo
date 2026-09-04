/** Centralized query keys — plant workspace on pending, catalog, admins, audit. */

export const adminQueryKeys = {
  all: ["admin"] as const,
  pending: (sessionToken: string, plantId: string | null) =>
    [...adminQueryKeys.all, "pending", sessionToken, plantId ?? "all"] as const,
  registrationImage: (sessionToken: string, requestId: string) =>
    [...adminQueryKeys.all, "registration-image", sessionToken, requestId] as const,
  /** Active plants — public GET /plants (workspace selector). */
  plants: () => [...adminQueryKeys.all, "plants"] as const,
  /** Full catalog — GET /admin/plants (incl. inactive; PLANTS_MANAGE). */
  plantCatalog: (sessionToken: string) =>
    [...adminQueryKeys.all, "plant-catalog", sessionToken] as const,
  /** Plant admin roster — GET /admin/users?plantId=&q= */
  plantAdmins: (sessionToken: string, plantId: string, q: string) =>
    [...adminQueryKeys.all, "plant-admins", sessionToken, plantId, q] as const,
  /**
   * Audit timeline — GET /admin/audit (keyset pages under same key via infinite query).
   */
  audit: (
    sessionToken: string,
    plantId: string,
    category: string,
    q: string,
  ) =>
    [...adminQueryKeys.all, "audit", sessionToken, plantId, category, q] as const,
  grantPreview: (sessionToken: string, employeeId: string) =>
    [...adminQueryKeys.all, "grant-preview", sessionToken, employeeId] as const,
};
