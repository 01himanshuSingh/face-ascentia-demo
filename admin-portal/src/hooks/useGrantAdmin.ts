import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import {
  grantPlantAdmin,
  isAdminApiError,
  previewGrantTarget,
  type AdminGrantPayload,
  type AdminGrantPreview,
  type AdminSession,
} from "../api/adminApi";
import { adminQueryKeys } from "../lib/queryKeys";

type UseGrantAdminOptions = {
  session: AdminSession | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

function queryErrorMessage(error: unknown, fallback: string): string {
  return isAdminApiError(error) ? error.message : fallback;
}

export function useGrantAdmin({
  session,
  enabled,
  onAuthFailure,
}: UseGrantAdminOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lookupEmployeeId, setLookupEmployeeId] = useState("");

  const previewQuery = useQuery({
    queryKey: adminQueryKeys.grantPreview(token ?? "", lookupEmployeeId),
    queryFn: () => previewGrantTarget(token!, lookupEmployeeId),
    enabled: enabled && Boolean(token) && lookupEmployeeId.length > 0,
    retry: false,
    meta: { onAuthFailure },
  });

  const grantMutation = useMutation({
    mutationFn: (payload: AdminGrantPayload) =>
      grantPlantAdmin(token!, payload),
    onMutate: () => {
      setActionError(null);
      setStatusMessage(null);
    },
    onSuccess: (result) => {
      setStatusMessage(result.message);
    },
    onError: (error) => {
      if (onAuthFailure(error)) {
        return;
      }
      setActionError(
        queryErrorMessage(error, "Failed to grant plant admin role."),
      );
    },
  });

  const lookupEmployee = useCallback(
    (employeeId: string) => {
      const normalized = employeeId.trim();
      setLookupEmployeeId(normalized);
      if (!normalized) {
        queryClient.removeQueries({
          queryKey: adminQueryKeys.grantPreview(token ?? "", lookupEmployeeId),
        });
      }
    },
    [lookupEmployeeId, queryClient, token],
  );

  const clearPreview = useCallback(() => {
    setLookupEmployeeId("");
  }, []);

  const submitGrant = useCallback(
    async (payload: AdminGrantPayload) => {
      await grantMutation.mutateAsync(payload);
    },
    [grantMutation],
  );

  const preview: AdminGrantPreview | null =
    previewQuery.data && previewQuery.data.employeeId === lookupEmployeeId
      ? previewQuery.data
      : null;

  return {
    preview,
    previewLoading: previewQuery.isFetching,
    previewError: previewQuery.error
      ? queryErrorMessage(previewQuery.error, "Failed to look up employee.")
      : null,
    lookupEmployee,
    clearPreview,
    busy: grantMutation.isPending,
    statusMessage,
    actionError,
    submitGrant,
    clearStatus: () => {
      setStatusMessage(null);
      setActionError(null);
    },
  };
}
