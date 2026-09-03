import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  grantPlantAdmin,
  previewGrantTarget,
  type AdminGrantPayload,
  type AdminGrantPreview,
  type AdminSession,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UseGrantAdminOptions = {
  session: AdminSession | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function useGrantAdmin({
  session,
  enabled,
  onAuthFailure,
}: UseGrantAdminOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lookupEmployeeId, setLookupEmployeeId] = useState("");
  const [toastedPreviewAt, setToastedPreviewAt] = useState(0);

  const previewQuery = useQuery({
    queryKey: adminQueryKeys.grantPreview(token ?? "", lookupEmployeeId),
    queryFn: () => previewGrantTarget(token!, lookupEmployeeId),
    enabled: enabled && Boolean(token) && lookupEmployeeId.length > 0,
    retry: false,
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (!previewQuery.error || onAuthFailure(previewQuery.error)) {
      return;
    }
    if (previewQuery.errorUpdatedAt === toastedPreviewAt) {
      return;
    }
    const formatted = formatAdminError(
      previewQuery.error,
      "Failed to look up employee.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedPreviewAt(previewQuery.errorUpdatedAt);
  }, [
    onAuthFailure,
    previewQuery.error,
    previewQuery.errorUpdatedAt,
    toast,
    toastedPreviewAt,
  ]);

  const grantMutation = useMutation({
    mutationFn: (payload: AdminGrantPayload) =>
      grantPlantAdmin(token!, payload),
    onMutate: () => {
      setActionError(null);
      setStatusMessage(null);
    },
    onSuccess: (result) => {
      setStatusMessage(result.message);
      toast.success("Plant admin granted", result.message);
    },
    onError: (error) => {
      if (onAuthFailure(error)) {
        return;
      }
      const formatted = formatAdminError(
        error,
        "Failed to grant plant admin role.",
      );
      setActionError(formatted.title);
      toast.error(formatted.title, formatted.description);
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
      ? formatAdminError(previewQuery.error, "Failed to look up employee.")
          .title
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
