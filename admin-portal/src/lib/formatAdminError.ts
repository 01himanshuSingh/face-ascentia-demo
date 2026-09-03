import { isAdminApiError } from "../api/adminApi";

/**
 * Turn API / unknown failures into toast copy: what happened + why (code).
 */
export function formatAdminError(
  error: unknown,
  fallbackTitle: string,
): { title: string; description?: string } {
  if (isAdminApiError(error)) {
    const why =
      error.code && error.code !== "UNKNOWN"
        ? `Why: ${error.code}${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ""}`
        : error.httpStatus
          ? `HTTP ${error.httpStatus}`
          : undefined;
    return {
      title: error.message || fallbackTitle,
      description: why,
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return { title: fallbackTitle, description: error.message };
  }

  return { title: fallbackTitle };
}
