/** Centralized query keys — extend when adding grant-admin, audit, etc. */
export const adminQueryKeys = {
  all: ["admin"] as const,
  pending: (sessionToken: string) =>
    [...adminQueryKeys.all, "pending", sessionToken] as const,
  registrationImage: (sessionToken: string, requestId: string) =>
    [...adminQueryKeys.all, "registration-image", sessionToken, requestId] as const,
  plants: () => [...adminQueryKeys.all, "plants"] as const,
  grantPreview: (sessionToken: string, employeeId: string) =>
    [...adminQueryKeys.all, "grant-preview", sessionToken, employeeId] as const,
};
