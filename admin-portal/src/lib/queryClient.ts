import { QueryClient } from "@tanstack/react-query";

import { isAdminApiError } from "../api/adminApi";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (isAdminApiError(error) && error.httpStatus === 401) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
