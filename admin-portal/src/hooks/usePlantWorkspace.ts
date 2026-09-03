/**
 * Active plant workspace — view lens for pending queue (and later grant search).
 *
 * SUPER: select plant; persisted in sessionStorage (not admin_roles).
 * PLANT_ADMIN: locked to session.plantId; no selector.
 *
 * Backend still enforces plant scope. This hook only supplies plantId to APIs.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  isSuperAdmin,
  listPlants,
  loadWorkspacePlantId,
  resolveWorkspacePlantId,
  saveWorkspacePlantId,
  type AdminSession,
  type PlantListItem,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

type UsePlantWorkspaceOptions = {
  session: AdminSession | null;
  enabled: boolean;
  onAuthFailure: (error: unknown) => boolean;
};

export function usePlantWorkspace({
  session,
  enabled,
  onAuthFailure,
}: UsePlantWorkspaceOptions) {
  const toast = useToast();
  const superAdmin = session ? isSuperAdmin(session) : false;
  const [selectedPlantId, setSelectedPlantIdState] = useState<string | null>(
    () => loadWorkspacePlantId(),
  );
  const [toastedPlantsAt, setToastedPlantsAt] = useState(0);

  const plantsQuery = useQuery({
    queryKey: adminQueryKeys.plants(),
    queryFn: listPlants,
    enabled: enabled && superAdmin,
    staleTime: 5 * 60_000,
    meta: { onAuthFailure },
  });

  useEffect(() => {
    if (!plantsQuery.error || onAuthFailure(plantsQuery.error)) {
      return;
    }
    if (plantsQuery.errorUpdatedAt === toastedPlantsAt) {
      return;
    }
    const formatted = formatAdminError(
      plantsQuery.error,
      "Failed to load plants.",
    );
    toast.error(formatted.title, formatted.description);
    setToastedPlantsAt(plantsQuery.errorUpdatedAt);
  }, [
    onAuthFailure,
    plantsQuery.error,
    plantsQuery.errorUpdatedAt,
    toast,
    toastedPlantsAt,
  ]);

  const plants: PlantListItem[] = plantsQuery.data ?? [];

  useEffect(() => {
    if (!superAdmin || plants.length === 0) {
      return;
    }
    const storedValid = plants.some((plant) => plant.plantId === selectedPlantId);
    if (storedValid) {
      return;
    }
    const firstId = plants[0]?.plantId ?? null;
    setSelectedPlantIdState(firstId);
    saveWorkspacePlantId(firstId);
  }, [plants, selectedPlantId, superAdmin]);

  const setSelectedPlantId = useCallback((plantId: string) => {
    setSelectedPlantIdState(plantId);
    saveWorkspacePlantId(plantId);
  }, []);

  const workspacePlantId = session
    ? resolveWorkspacePlantId(session, selectedPlantId)
    : null;

  const selectedPlant =
    plants.find((plant) => plant.plantId === workspacePlantId) ?? null;

  return {
    isSuperAdmin: superAdmin,
    plants,
    plantsLoading: superAdmin && plantsQuery.isLoading,
    plantsError:
      superAdmin && plantsQuery.error
        ? formatAdminError(plantsQuery.error, "Failed to load plants.").title
        : null,
    workspacePlantId,
    selectedPlant,
    setSelectedPlantId,
  };
}
