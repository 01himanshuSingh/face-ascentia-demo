/**
 * Plant catalog (Layer B) — list / create / update / soft-deactivate.
 *
 * Separate from usePlantWorkspace (Layer A lens). On mutation success, invalidate
 * both plantCatalog and plants so the SUPER workspace selector stays in sync.
 *
 * Authz: UI gated by session PLANTS_MANAGE; backend enforces PLANTS_MANAGE.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastedListAt, setToastedListAt] = useState(0);

  const catalogQuery = useQuery({
    queryKey: adminQueryKeys.plantCatalog(token ?? ""),
    queryFn: () => listAdminPlants(token!),
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

  const invalidateCatalogAndWorkspace = useCallback(async () => {
    if (!token) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.plantCatalog(token),
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

  const plants: AdminPlantItem[] = catalogQuery.data ?? [];

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
