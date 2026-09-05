/**
 * Plant workers roster — Active (enrolled) or Left (INACTIVE history).
 *
 * Workspace plantId from client lens. Soft revoke keeps employee_id;
 * switch to Left to see former workers. Paginated (15 / page).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  EMPLOYEE_PAGE_SIZE,
  listPlantEmployees,
  revokePlantEmployee,
  type AdminEmployeeItem,
  type AdminSession,
  type EmployeeListStatus,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UsePlantEmployeesOptions = {
  session: AdminSession | null;
  workspacePlantId: string | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function usePlantEmployees({
  session,
  workspacePlantId,
  enabled,
  onAuthFailure,
}: UsePlantEmployeesOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rosterStatus, setRosterStatusState] =
    useState<EmployeeListStatus>("active");
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
  }, [workspacePlantId, rosterStatus, debouncedQ]);

  const setRosterStatus = useCallback((status: EmployeeListStatus) => {
    setRosterStatusState(status);
  }, []);

  const listEnabled =
    enabled && Boolean(token) && Boolean(workspacePlantId);

  const listQuery = useQuery({
    queryKey: adminQueryKeys.employees(
      token ?? "",
      workspacePlantId ?? "",
      rosterStatus,
      debouncedQ,
      page,
    ),
    queryFn: () =>
      listPlantEmployees(token!, workspacePlantId!, {
        status: rosterStatus,
        q: debouncedQ || undefined,
        limit: EMPLOYEE_PAGE_SIZE,
        offset: (page - 1) * EMPLOYEE_PAGE_SIZE,
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
      "Could not load employees.",
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

  const employees: AdminEmployeeItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.limit ?? EMPLOYEE_PAGE_SIZE;
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

  const revokeMutation = useMutation({
    mutationFn: ({
      employeeId,
      reason,
    }: {
      employeeId: string;
      reason: string;
    }) => revokePlantEmployee(token!, employeeId, workspacePlantId!, reason),
    onSuccess: async (result) => {
      toast.success("Employee revoked", result.message);
      if (token && workspacePlantId) {
        await queryClient.invalidateQueries({
          queryKey: [...adminQueryKeys.all, "employees", token, workspacePlantId],
        });
      }
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(
          error,
          "Failed to revoke employee.",
        );
        toast.error(formatted.title, formatted.description);
      }
    },
  });

  const revoke = useCallback(
    async (employeeId: string, reason: string) => {
      if (!token || !workspacePlantId) {
        return;
      }
      await revokeMutation.mutateAsync({ employeeId, reason });
    },
    [revokeMutation, token, workspacePlantId],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setPage(clamped);
    },
    [totalPages],
  );

  const refresh = useCallback(async () => {
    if (!token || !workspacePlantId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: [...adminQueryKeys.all, "employees", token, workspacePlantId],
    });
  }, [queryClient, token, workspacePlantId]);

  return {
    employees,
    total,
    page,
    pageSize,
    totalPages,
    goToPage,
    loading: listQuery.isLoading || listQuery.isFetching,
    busy: revokeMutation.isPending,
    rosterStatus,
    setRosterStatus,
    searchInput,
    setSearchInput,
    needsPlant: !workspacePlantId,
    revoke,
    refresh,
  };
}
