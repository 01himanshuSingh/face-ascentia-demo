/**
 * Plant-scoped Auth Log (AUTH_LOG_VIEW).
 *
 * Dedicated sidebar tab — kiosk LOGIN attempts only (not compliance Audit).
 * Text + matchPercent; no face images.
 * Offset pagination (15 / page) + KPI summary for the same filters.
 *
 * Path: admin-portal/src/hooks/useAuthLog.ts
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  AUTH_LOG_PAGE_SIZE,
  fetchAuthLogSummary,
  listAuthLogs,
  type AdminSession,
  type AuthLogItem,
  type AuthLogReasonCode,
  type AuthLogResultFilter,
  type AuthLogSummaryResult,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UseAuthLogOptions = {
  session: AdminSession | null;
  workspacePlantId: string | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function useAuthLog({
  session,
  workspacePlantId,
  enabled,
  onAuthFailure,
}: UseAuthLogOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();

  const [result, setResultState] = useState<AuthLogResultFilter>("all");
  const [reasonCode, setReasonCodeState] = useState<
    AuthLogReasonCode | "" | string
  >("");
  /** ISO datetime strings for API; empty → backend default (today UTC). */
  const [from, setFromState] = useState("");
  const [to, setToState] = useState("");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<AuthLogItem | null>(null);
  const [toastedListAt, setToastedListAt] = useState(0);
  const [toastedSummaryAt, setToastedSummaryAt] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [workspacePlantId, result, reasonCode, from, to, debouncedQ]);

  const setResult = useCallback((next: AuthLogResultFilter) => {
    setResultState(next);
  }, []);

  const setReasonCode = useCallback((next: AuthLogReasonCode | "" | string) => {
    setReasonCodeState(next);
  }, []);

  const setFrom = useCallback((next: string) => {
    setFromState(next.trim());
  }, []);

  const setTo = useCallback((next: string) => {
    setToState(next.trim());
  }, []);

  const listEnabled = enabled && Boolean(token) && Boolean(workspacePlantId);
  const reasonKey = typeof reasonCode === "string" ? reasonCode.trim() : "";

  const sharedFilters = {
    result,
    reasonCode: reasonKey || undefined,
    q: debouncedQ || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const listQuery = useQuery({
    queryKey: adminQueryKeys.authLog(
      token ?? "",
      workspacePlantId ?? "",
      result,
      reasonKey,
      debouncedQ,
      from,
      to,
      page,
    ),
    queryFn: () =>
      listAuthLogs(token!, workspacePlantId!, {
        ...sharedFilters,
        limit: AUTH_LOG_PAGE_SIZE,
        offset: (page - 1) * AUTH_LOG_PAGE_SIZE,
      }),
    enabled: listEnabled,
    meta: { onAuthFailure },
  });

  const summaryQuery = useQuery({
    queryKey: adminQueryKeys.authLogSummary(
      token ?? "",
      workspacePlantId ?? "",
      result,
      reasonKey,
      debouncedQ,
      from,
      to,
    ),
    queryFn: () =>
      fetchAuthLogSummary(token!, workspacePlantId!, sharedFilters),
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
      "Could not load auth log.",
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

  useEffect(() => {
    if (!summaryQuery.error || onAuthFailure(summaryQuery.error)) {
      return;
    }
    if (summaryQuery.errorUpdatedAt === toastedSummaryAt) {
      return;
    }
    const formatted = formatAdminError(
      summaryQuery.error,
      "Could not load auth log summary.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedSummaryAt(summaryQuery.errorUpdatedAt);
  }, [
    summaryQuery.error,
    summaryQuery.errorUpdatedAt,
    onAuthFailure,
    toast,
    toastedSummaryAt,
  ]);

  const items: AuthLogItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.limit ?? AUTH_LOG_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const summary: AuthLogSummaryResult | null = summaryQuery.data ?? null;

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
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...adminQueryKeys.all, "auth-log", token, workspacePlantId],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          ...adminQueryKeys.all,
          "auth-log-summary",
          token,
          workspacePlantId,
        ],
      }),
    ]);
  }, [queryClient, token, workspacePlantId]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setPage(clamped);
    },
    [totalPages],
  );

  const openDetail = useCallback((item: AuthLogItem) => {
    setSelected(item);
  }, []);

  const closeDetail = useCallback(() => {
    setSelected(null);
  }, []);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    goToPage,
    loading: listQuery.isLoading || listQuery.isFetching,
    summaryLoading: summaryQuery.isLoading || summaryQuery.isFetching,
    summary,
    result,
    setResult,
    reasonCode,
    setReasonCode,
    from,
    setFrom,
    to,
    setTo,
    searchInput,
    setSearchInput,
    selected,
    openDetail,
    closeDetail,
    needsPlant: !workspacePlantId,
    refresh,
  };
}
