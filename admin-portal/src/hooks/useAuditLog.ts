/**
 * Plant-scoped audit timeline (AUDIT_VIEW).
 *
 * Text feed only — faces load on demand in AuditEventDialog.
 * Offset pagination (15 / page) across all category chips.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  AUDIT_PAGE_SIZE,
  listAuditLogs,
  type AdminSession,
  type AuditCategory,
  type AuditLogItem,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UseAuditLogOptions = {
  session: AdminSession | null;
  workspacePlantId: string | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function useAuditLog({
  session,
  workspacePlantId,
  enabled,
  onAuthFailure,
}: UseAuditLogOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [category, setCategoryState] = useState<AuditCategory>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [toastedListAt, setToastedListAt] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [workspacePlantId, category, debouncedQ]);

  const setCategory = useCallback((next: AuditCategory) => {
    setCategoryState(next);
  }, []);

  const listEnabled = enabled && Boolean(token) && Boolean(workspacePlantId);

  const listQuery = useQuery({
    queryKey: adminQueryKeys.audit(
      token ?? "",
      workspacePlantId ?? "",
      category,
      debouncedQ,
      page,
    ),
    queryFn: () =>
      listAuditLogs(token!, workspacePlantId!, {
        category,
        q: debouncedQ || undefined,
        limit: AUDIT_PAGE_SIZE,
        offset: (page - 1) * AUDIT_PAGE_SIZE,
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
      "Could not load audit log.",
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

  const items: AuditLogItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.limit ?? AUDIT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    if (total === 0) {
      if (page !== 1) {
        setPage(1);
      }
      return;
    }
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, pageSize, total]);

  const refresh = useCallback(async () => {
    if (!token || !workspacePlantId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: [...adminQueryKeys.all, "audit", token, workspacePlantId],
    });
  }, [queryClient, token, workspacePlantId]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setPage(clamped);
    },
    [totalPages],
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    goToPage,
    loading: listQuery.isLoading || listQuery.isFetching,
    category,
    setCategory,
    searchInput,
    setSearchInput,
    needsPlant: !workspacePlantId,
    refresh,
  };
}
