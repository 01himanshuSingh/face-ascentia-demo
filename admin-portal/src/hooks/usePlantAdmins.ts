/**
 * Plant admin roster + ungrant (SUPER workspace).
 *
 * Uses workspacePlantId from the client lens — never rewrites admin_roles.
 * Authz: canRevokePlantAdmins (global + ADMIN_GRANT_PLANT_ADMIN); backend enforces.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  listPlantAdmins,
  revokePlantAdmin,
  type AdminSession,
  type AdminUserItem,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UsePlantAdminsOptions = {
  session: AdminSession | null;
  workspacePlantId: string | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function usePlantAdmins({
  session,
  workspacePlantId,
  enabled,
  onAuthFailure,
}: UsePlantAdminsOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [toastedListAt, setToastedListAt] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const listEnabled =
    enabled && Boolean(token) && Boolean(workspacePlantId);

  const listQuery = useQuery({
    queryKey: adminQueryKeys.plantAdmins(
      token ?? "",
      workspacePlantId ?? "",
      debouncedQ,
    ),
    queryFn: () =>
      listPlantAdmins(token!, workspacePlantId!, {
        q: debouncedQ || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: listEnabled,
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (!listQuery.error || onAuthFailure(listQuery.error)) {
      return;
    }
    if (listQuery.errorUpdatedAt === toastedListAt) {
      return;
    }
    const formatted = formatAdminError(
      listQuery.error,
      "Could not load plant admins.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedListAt(listQuery.errorUpdatedAt);
  }, [
    listQuery.error,
    listQuery.errorUpdatedAt,
    onAuthFailure,
    toast,
    toastedListAt,
  ]);

  const revokeMutation = useMutation({
    mutationFn: ({
      employeeId,
      reason,
    }: {
      employeeId: string;
      reason?: string;
    }) => revokePlantAdmin(token!, employeeId, workspacePlantId!, reason),
    onSuccess: async (result) => {
      toast.success("Admin revoked", result.message);
      if (token && workspacePlantId) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.plantAdmins(token, workspacePlantId, debouncedQ),
        });
      }
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(error, "Failed to revoke admin.");
        toast.error(formatted.title, formatted.description);
      }
    },
  });

  const admins: AdminUserItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const revoke = useCallback(
    async (employeeId: string, reason?: string) => {
      if (!token || !workspacePlantId) {
        return;
      }
      await revokeMutation.mutateAsync({ employeeId, reason });
    },
    [revokeMutation, token, workspacePlantId],
  );

  const refresh = useCallback(async () => {
    if (!token || !workspacePlantId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: adminQueryKeys.plantAdmins(token, workspacePlantId, debouncedQ),
    });
  }, [debouncedQ, queryClient, token, workspacePlantId]);

  return {
    admins,
    total,
    loading: listQuery.isLoading || listQuery.isFetching,
    busy: revokeMutation.isPending,
    searchInput,
    setSearchInput,
    needsPlant: !workspacePlantId,
    revoke,
    refresh,
  };
}
