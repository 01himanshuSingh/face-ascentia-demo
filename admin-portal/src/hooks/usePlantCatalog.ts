/**
 * Plant catalog (Layer B) — list / create / update / soft-deactivate.
 *
 * Separate from usePlantWorkspace (Layer A lens). On mutation success, invalidate
 * both plantCatalog and plants so the SUPER workspace selector stays in sync.
 *
 * Authz: UI gated by session PLANTS_MANAGE; backend enforces PLANTS_MANAGE.
 * SUPER catalog is paginated (15 / page).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  PLANT_PAGE_SIZE,
  createPlant,
  listAdminPlants,
  updatePlant,
  type AdminPlantItem,
  type AdminSession,
  type PlantCreatePayload,
  type PlantUpdatePayload,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UsePlantCatalogOptions = {
  session: AdminSession | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function usePlantCatalog({
  session,
  enabled,
  onAuthFailure,
}: UsePlantCatalogOptions) {
  const token = session?.adminSessionToken ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastedListAt, setToastedListAt] = useState(0);

  const catalogQuery = useQuery({
    queryKey: adminQueryKeys.plantCatalog(token ?? "", page),
    queryFn: () =>
      listAdminPlants(token!, {
        limit: PLANT_PAGE_SIZE,
        offset: (page - 1) * PLANT_PAGE_SIZE,
      }),
    enabled: enabled && Boolean(token),
    staleTime: 30_000,
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (!catalogQuery.error || onAuthFailure(catalogQuery.error)) {
      return;
    }
    if (catalogQuery.errorUpdatedAt === toastedListAt) {
      return;
    }
    const formatted = formatAdminError(
      catalogQuery.error,
      "Could not load plant catalog.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedListAt(catalogQuery.errorUpdatedAt);
  }, [
    catalogQuery.error,
    catalogQuery.errorUpdatedAt,
    onAuthFailure,
    toast,
    toastedListAt,
  ]);

  const plants: AdminPlantItem[] = catalogQuery.data?.plants ?? [];
  const total = catalogQuery.data?.total ?? 0;
  const pageSize = catalogQuery.data?.limit ?? PLANT_PAGE_SIZE;
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

  const invalidateCatalogAndWorkspace = useCallback(async () => {
    if (!token) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...adminQueryKeys.all, "plant-catalog", token],
      }),
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.plants(),
      }),
    ]);
  }, [queryClient, token]);

  const createMutation = useMutation({
    mutationFn: (payload: PlantCreatePayload) => createPlant(token!, payload),
    onMutate: () => {
      setActionError(null);
      setStatusMessage(null);
    },
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      toast.success("Plant created", result.message);
      setPage(1);
      await invalidateCatalogAndWorkspace();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(error, "Failed to create plant.");
        setActionError(formatted.title);
        toast.error(formatted.title, formatted.description);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      plantId,
      payload,
    }: {
      plantId: string;
      payload: PlantUpdatePayload;
    }) => updatePlant(token!, plantId, payload),
    onMutate: () => {
      setActionError(null);
      setStatusMessage(null);
    },
    onSuccess: async (result) => {
      setStatusMessage(result.message);
      toast.success("Plant updated", result.message);
      await invalidateCatalogAndWorkspace();
    },
    onError: (error) => {
      if (!onAuthFailure(error)) {
        const formatted = formatAdminError(error, "Failed to update plant.");
        setActionError(formatted.title);
        toast.error(formatted.title, formatted.description);
      }
    },
  });

  const create = useCallback(
    async (payload: PlantCreatePayload) => {
      if (!token) {
        return;
      }
      await createMutation.mutateAsync(payload);
    },
    [createMutation, token],
  );

  const update = useCallback(
    async (plantId: string, payload: PlantUpdatePayload) => {
      if (!token) {
        return;
      }
      await updateMutation.mutateAsync({ plantId, payload });
    },
    [token, updateMutation],
  );

  const setActive = useCallback(
    async (plantId: string, isActive: boolean) => {
      await update(plantId, { isActive });
    },
    [update],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setPage(clamped);
    },
    [totalPages],
  );

  const refresh = useCallback(async () => {
    setActionError(null);
    await invalidateCatalogAndWorkspace();
  }, [invalidateCatalogAndWorkspace]);

  const clearStatus = useCallback(() => {
    setStatusMessage(null);
    setActionError(null);
  }, []);

  const listError =
    catalogQuery.error && !onAuthFailure(catalogQuery.error)
      ? formatAdminError(catalogQuery.error, "Could not load plant catalog.")
          .title
      : null;

  return {
    plants,
    total,
    page,
    pageSize,
    totalPages,
    goToPage,
    loading: catalogQuery.isLoading || catalogQuery.isFetching,
    error: actionError ?? listError,
    statusMessage,
    busy: createMutation.isPending || updateMutation.isPending,
    create,
    update,
    setActive,
    refresh,
    clearStatus,
  };
}
