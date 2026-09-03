import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  approveRegistration,
  fetchRegistrationImage,
  listPending,
  rejectRegistration,
  type AdminSession,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UseRegistrationQueueOptions = {
  session: AdminSession | null;
  workspacePlantId: string | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function useRegistrationQueue({
  session,
  workspacePlantId,
  enabled,
  onAuthFailure,
}: UseRegistrationQueueOptions) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const token = session?.adminSessionToken ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastedPendingAt, setToastedPendingAt] = useState(0);
  const [toastedImageAt, setToastedImageAt] = useState(0);

  const pendingQuery = useQuery({
    queryKey: adminQueryKeys.pending(token ?? "", workspacePlantId),
    queryFn: () => listPending(token!, workspacePlantId),
    enabled: enabled && Boolean(token) && Boolean(workspacePlantId),
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (!pendingQuery.error || onAuthFailure(pendingQuery.error)) {
      return;
    }
    if (pendingQuery.errorUpdatedAt === toastedPendingAt) {
      return;
    }
    const formatted = formatAdminError(
      pendingQuery.error,
      "Could not load pending registrations.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedPendingAt(pendingQuery.errorUpdatedAt);
  }, [
    onAuthFailure,
    pendingQuery.error,
    pendingQuery.errorUpdatedAt,
    toast,
    toastedPendingAt,
  ]);

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
    if (!imageQuery.error || onAuthFailure(imageQuery.error)) {
      return;
    }
    if (imageQuery.errorUpdatedAt === toastedImageAt) {
      return;
    }
    const formatted = formatAdminError(
      imageQuery.error,
      "Could not load registration photo.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedImageAt(imageQuery.errorUpdatedAt);
  }, [
    imageQuery.error,
    imageQuery.errorUpdatedAt,
    onAuthFailure,
    toast,
    toastedImageAt,
  ]);

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
      queryKey: adminQueryKeys.pending(token, workspacePlantId),
    });
  }, [queryClient, token, workspacePlantId]);

  const approveMutation = useMutation({
    mutationFn: (reason?: string) =>
      approveRegistration(token!, selectedId!, reason),
    onMutate: () => setActionError(null),
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      toast.success("Registration approved", result.message);
      await invalidatePending();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(error, "Approve failed.");
        setActionError(formatted.title);
        toast.error(formatted.title, formatted.description);
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      rejectRegistration(token!, selectedId!, reason),
    onMutate: () => setActionError(null),
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      toast.success("Registration rejected", result.message);
      await invalidatePending();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(error, "Reject failed.");
        setActionError(formatted.title);
        toast.error(formatted.title, formatted.description);
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
      ? formatAdminError(
          pendingQuery.error,
          "Could not load pending registrations.",
        ).title
      : null) ??
    (imageQuery.error && !onAuthFailure(imageQuery.error)
      ? formatAdminError(imageQuery.error, "Could not load registration photo.")
          .title
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
