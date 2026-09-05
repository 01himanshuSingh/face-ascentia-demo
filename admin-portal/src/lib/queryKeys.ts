/** Centralized query keys — plant workspace on pending, catalog, admins, audit. */

export const adminQueryKeys = {
  all: ["admin"] as const,
  pending: (sessionToken: string, plantId: string | null, page: number) =>
    [
      ...adminQueryKeys.all,
      "pending",
      sessionToken,
      plantId ?? "all",
      page,
    ] as const,
  registrationImage: (sessionToken: string, requestId: string) =>
    [...adminQueryKeys.all, "registration-image", sessionToken, requestId] as const,
  /** Active plants — public GET /plants (workspace selector). */
  plants: () => [...adminQueryKeys.all, "plants"] as const,
  /** Full catalog — GET /admin/plants (incl. inactive; PLANTS_MANAGE). */
  plantCatalog: (sessionToken: string, page: number) =>
    [...adminQueryKeys.all, "plant-catalog", sessionToken, page] as const,
  /** Plant admin roster — GET /admin/users?plantId=&q=&limit=&offset= */
  plantAdmins: (
    sessionToken: string,
    plantId: string,
    q: string,
    page: number,
  ) =>
    [
      ...adminQueryKeys.all,
      "plant-admins",
      sessionToken,
      plantId,
      q,
      page,
    ] as const,
  /** Workers roster — GET /admin/employees?plantId=&status=&q=&limit=&offset= */
  employees: (
    sessionToken: string,
    plantId: string,
    status: string,
    q: string,
    page: number,
  ) =>
    [
      ...adminQueryKeys.all,
      "employees",
      sessionToken,
      plantId,
      status,
      q,
      page,
    ] as const,
  /**
   * Audit timeline — GET /admin/audit (offset pages).
   */
  audit: (
    sessionToken: string,
    plantId: string,
    category: string,
    q: string,
    page: number,
  ) =>
    [
      ...adminQueryKeys.all,
      "audit",
      sessionToken,
      plantId,
      category,
      q,
      page,
    ] as const,
  grantPreview: (sessionToken: string, employeeId: string) =>
    [...adminQueryKeys.all, "grant-preview", sessionToken, employeeId] as const,
};
