import { useEffect, useState, type FormEvent } from "react";

import type {
  AdminPlantItem,
  PlantCreatePayload,
  PlantUpdatePayload,
} from "../../api/adminApi";
import { LoadingButton } from "../ui/LoadingButton";

export type PlantFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  plant: AdminPlantItem | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (payload: PlantCreatePayload) => Promise<void>;
  onUpdate: (plantId: string, payload: PlantUpdatePayload) => Promise<void>;
};

export function PlantFormDialog({
  open,
  mode,
  plant,
  busy,
  onClose,
  onCreate,
  onUpdate,
}: PlantFormDialogProps) {
  const [plantCode, setPlantCode] = useState("");
  const [plantName, setPlantName] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === "edit" && plant) {
      setPlantCode(plant.plantCode);
      setPlantName(plant.plantName);
      return;
    }
    setPlantCode("");
    setPlantName("");
  }, [mode, open, plant]);

  if (!open) {
    return null;
  }

  const title = mode === "create" ? "Create plant" : "Edit plant";
  const canSubmit =
    plantCode.trim().length > 0 && plantName.trim().length > 0 && !busy;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const code = plantCode.trim().toUpperCase();
    const name = plantName.trim();

    void (async () => {
      if (mode === "create") {
        await onCreate({ plantCode: code, plantName: name });
      } else if (plant) {
        await onUpdate(plant.plantId, {
          plantCode: code,
          plantName: name,
        });
      }
      onClose();
    })();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-form-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl shadow-text/10">
        <h2
          id="plant-form-title"
          className="text-lg font-semibold tracking-tight text-text"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Plant code is unique and stored uppercase. Soft-deactivate from the
          catalog table — do not delete plants that still have workers.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Plant code
            <input
              className="rounded-lg border border-border bg-white px-3 py-2.5 font-mono text-base uppercase text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
              value={plantCode}
              onChange={(event) => setPlantCode(event.target.value)}
              placeholder="e.g. DEV02"
              autoComplete="off"
              disabled={busy}
              required
              maxLength={64}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Plant name
            <input
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
              value={plantName}
              onChange={(event) => setPlantName(event.target.value)}
              placeholder="e.g. Development Plant 2"
              autoComplete="off"
              disabled={busy}
              required
              maxLength={200}
            />
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              loading={busy}
              loadingLabel="Saving…"
              disabled={!canSubmit && !busy}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              {mode === "create" ? "Create" : "Save"}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
