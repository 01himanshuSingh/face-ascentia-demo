/**
 * Plant-scoped audit timeline (AUDIT_VIEW).
 *
 * Text feed only — faces load on demand in AuditEventDialog via
 * fetchRegistrationImage for APPROVE / ADMIN_KIOSK_ENROLL.
 * Keyset pagination via nextCursor (Load more).
 */

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
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
  const [category, setCategory] = useState<AuditCategory>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [toastedListAt, setToastedListAt] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const listEnabled = enabled && Boolean(token) && Boolean(workspacePlantId);

  const listQuery = useInfiniteQuery({
    queryKey: adminQueryKeys.audit(
      token ?? "",
      workspacePlantId ?? "",
      category,
      debouncedQ,
    ),
    queryFn: ({ pageParam }) =>
      listAuditLogs(token!, workspacePlantId!, {
        category,
        q: debouncedQ || undefined,
        limit: 50,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
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

  const items: AuditLogItem[] = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );

  const refresh = useCallback(async () => {
    if (!token || !workspacePlantId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: adminQueryKeys.audit(
        token,
        workspacePlantId,
        category,
        debouncedQ,
      ),
    });
  }, [category, debouncedQ, queryClient, token, workspacePlantId]);

  const loadMore = useCallback(async () => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage) {
      return;
    }
    await listQuery.fetchNextPage();
  }, [listQuery]);

  return {
    items,
    loading: listQuery.isLoading || (listQuery.isFetching && !listQuery.isFetchingNextPage),
    loadingMore: listQuery.isFetchingNextPage,
    hasMore: Boolean(listQuery.hasNextPage),
    category,
    setCategory,
    searchInput,
    setSearchInput,
    needsPlant: !workspacePlantId,
    refresh,
    loadMore,
  };
}
