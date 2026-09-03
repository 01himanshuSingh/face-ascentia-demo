/** Centralized query keys — include plant workspace on pending + plant catalog. */

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
  grantPreview: (sessionToken: string, employeeId: string) =>
    [...adminQueryKeys.all, "grant-preview", sessionToken, employeeId] as const,
};
