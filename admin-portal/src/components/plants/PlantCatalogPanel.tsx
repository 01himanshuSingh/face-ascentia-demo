import { useState } from "react";

import type {
  AdminPlantItem,
  PlantCreatePayload,
  PlantUpdatePayload,
} from "../../api/adminApi";
import { PlantCatalogTable } from "./PlantCatalogTable";
import { PlantFormDialog } from "./PlantFormDialog";

export type PlantCatalogPanelProps = {
  plants: AdminPlantItem[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  statusMessage: string | null;
  /** Global catalog admin only — plant-scoped admins cannot create workspaces. */
  allowCreate: boolean;
  /** Global catalog admin only — plant-scoped admins cannot deactivate. */
  allowDeactivate: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onCreate: (payload: PlantCreatePayload) => Promise<void>;
  onUpdate: (plantId: string, payload: PlantUpdatePayload) => Promise<void>;
  onSetActive: (plantId: string, isActive: boolean) => Promise<void>;
};

type DialogState =
  | { open: false }
  | { open: true; mode: "create"; plant: null }
  | { open: true; mode: "edit"; plant: AdminPlantItem };

export function PlantCatalogPanel({
  plants,
  loading,
  busy,
  error,
  statusMessage,
  allowCreate,
  allowDeactivate,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onCreate,
  onUpdate,
  onSetActive,
}: PlantCatalogPanelProps) {
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const closeDialog = () => setDialog({ open: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-text">
            {allowCreate ? "Plant catalog" : "Your plant"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {allowCreate
              ? "Create and manage plant workspaces. Deactivate hides a plant from the kiosk picker without deleting workers or enrollments."
              : "View and update your assigned plant. You cannot create another plant workspace or change plant active status."}
          </p>
        </div>
        {allowCreate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setDialog({ open: true, mode: "create", plant: null })
            }
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60"
          >
            Create plant
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          className="rounded-lg border border-primary/30 bg-primary/15 px-4 py-3 text-sm text-primary"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-400"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <PlantCatalogTable
        plants={plants}
        loading={loading}
        busy={busy}
        allowDeactivate={allowDeactivate}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={allowCreate ? onPageChange : undefined}
        onEdit={(plant) => setDialog({ open: true, mode: "edit", plant })}
        onToggleActive={(plant) => {
          void onSetActive(plant.plantId, !plant.isActive);
        }}
      />

      <PlantFormDialog
        open={dialog.open}
        mode={dialog.open ? dialog.mode : "create"}
        plant={dialog.open && dialog.mode === "edit" ? dialog.plant : null}
        busy={busy}
        onClose={closeDialog}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />
    </div>
  );
}
