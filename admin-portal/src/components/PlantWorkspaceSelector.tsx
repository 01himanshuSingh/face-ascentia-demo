import type { PlantListItem } from "../api/adminApi";

export type PlantWorkspaceSelectorProps = {
  plants: PlantListItem[];
  selectedPlantId: string | null;
  loading: boolean;
  disabled?: boolean;
  onChange: (plantId: string) => void;
};

/**
 * SUPER-only plant workspace picker. PLANT_ADMIN does not render this —
 * their plant is fixed from login.
 */
export function PlantWorkspaceSelector({
  plants,
  selectedPlantId,
  loading,
  disabled,
  onChange,
}: PlantWorkspaceSelectorProps) {
  return (
    <label className="flex min-w-[11rem] flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-text-muted">
      Plant workspace
      <select
        className="h-10 rounded-xl border border-border/80 bg-white/80 px-3 text-sm font-medium text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
        value={selectedPlantId ?? ""}
        disabled={disabled || loading || plants.length === 0}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Select plant workspace"
      >
        {loading ? (
          <option value="">Loading plants…</option>
        ) : plants.length === 0 ? (
          <option value="">No plants</option>
        ) : (
          plants.map((plant) => (
            <option key={plant.plantId} value={plant.plantId}>
              {plant.plantName} ({plant.plantCode})
            </option>
          ))
        )}
      </select>
    </label>
  );
}
