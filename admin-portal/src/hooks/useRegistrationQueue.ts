import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  approveRegistration,
  fetchRegistrationImage,
  isAdminApiError,
  listPending,
  rejectRegistration,
  type AdminSession,
} from "../api/adminApi";
import { adminQueryKeys } from "../lib/queryKeys";

type UseRegistrationQueueOptions = {
  session: AdminSession | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

function queryErrorMessage(error: unknown, fallback: string): string {
  return isAdminApiError(error) ? error.message : fallback;
}

export function useRegistrationQueue({
  session,
  enabled,
  onAuthFailure,
}: UseRegistrationQueueOptions) {
  const queryClient = useQueryClient();
  const token = session?.adminSessionToken ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: adminQueryKeys.pending(token ?? ""),
    queryFn: () => listPending(token!),
    enabled: enabled && Boolean(token),
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (pendingQuery.error && onAuthFailure(pendingQuery.error)) {
      return;
    }
  }, [onAuthFailure, pendingQuery.error]);

  const items = pendingQuery.data ?? [];

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current && items.some((item) => item.requestId === current)) {
        return current;
      }
      return items[0]?.requestId ?? null;
    });
  }, [items]);

  const imageQuery = useQuery({
    queryKey: adminQueryKeys.registrationImage(token ?? "", selectedId ?? ""),
    queryFn: () => fetchRegistrationImage(token!, selectedId!),
    enabled: enabled && Boolean(token && selectedId),
    staleTime: 60_000,
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (imageQuery.error && onAuthFailure(imageQuery.error)) {
      return;
    }
  }, [imageQuery.error, onAuthFailure]);

  useEffect(() => {
    const objectUrl = imageQuery.data;
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageQuery.data]);

  const invalidatePending = useCallback(async () => {
    if (!token) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: adminQueryKeys.pending(token),
    });
  }, [queryClient, token]);

  const approveMutation = useMutation({
    mutationFn: (reason?: string) =>
      approveRegistration(token!, selectedId!, reason),
    onMutate: () => setActionError(null),
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      await invalidatePending();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        setActionError(queryErrorMessage(error, "Approve failed."));
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      rejectRegistration(token!, selectedId!, reason),
    onMutate: () => setActionError(null),
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      await invalidatePending();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        setActionError(queryErrorMessage(error, "Reject failed."));
      }
    },
  });

  const selected = items.find((item) => item.requestId === selectedId) ?? null;

  const refresh = useCallback(async () => {
    setActionError(null);
    await invalidatePending();
  }, [invalidatePending]);

  const approve = useCallback(
    async (reason?: string) => {
      if (!token || !selectedId) {
        return;
      }
      await approveMutation.mutateAsync(reason);
    },
    [approveMutation, selectedId, token],
  );

  const reject = useCallback(
    async (reason: string) => {
      if (!token || !selectedId) {
        return;
      }
      await rejectMutation.mutateAsync(reason);
    },
    [rejectMutation, selectedId, token],
  );

  const decisionBusy = approveMutation.isPending || rejectMutation.isPending;

  const error =
    actionError ??
    (pendingQuery.error && !onAuthFailure(pendingQuery.error)
      ? queryErrorMessage(
          pendingQuery.error,
          "Could not load pending registrations.",
        )
      : null) ??
    (imageQuery.error && !onAuthFailure(imageQuery.error)
      ? queryErrorMessage(imageQuery.error, "Could not load registration photo.")
      : null);

  return {
    items,
    loading: pendingQuery.isLoading || pendingQuery.isFetching,
    error,
    selected,
    selectedId,
    setSelectedId,
    imageUrl: imageQuery.data ?? null,
    imageLoading: imageQuery.isLoading || imageQuery.isFetching,
    decisionBusy,
    statusMessage,
    refresh,
    approve,
    reject,
  };
}
