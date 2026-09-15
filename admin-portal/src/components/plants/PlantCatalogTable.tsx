import clsx from "clsx";

import {
  formatCapturedAt,
  type AdminPlantItem,
} from "../../api/adminApi";
import { LoadingButton } from "../ui/LoadingButton";

export type PlantCatalogTableProps = {
  plants: AdminPlantItem[];
  loading: boolean;
  busy: boolean;
  allowDeactivate: boolean;
  onEdit: (plant: AdminPlantItem) => void;
  onToggleActive: (plant: AdminPlantItem) => void;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

export function PlantCatalogTable({
  plants,
  loading,
  busy,
  allowDeactivate,
  onEdit,
  onToggleActive,
  total = 0,
  page = 1,
  pageSize = 15,
  totalPages = 1,
  onPageChange,
}: PlantCatalogTableProps) {
  if (loading && plants.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
        Loading plant catalog…
      </div>
    );
  }

  if (!loading && total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No plants yet. Create the first plant to open a workspace for
        registration review and plant admins.
      </div>
    );
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plants.map((plant) => (
              <tr
                key={plant.plantId}
                className="border-b border-background last:border-b-0"
              >
                <td className="px-4 py-3 font-medium text-text">
                  {plant.plantCode}
                </td>
                <td className="px-4 py-3 text-text">{plant.plantName}</td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                      plant.isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-background text-text-muted",
                    )}
                  >
                    {plant.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {formatCapturedAt(plant.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(plant)}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:opacity-60"
                    >
                      Edit
                    </button>
                    {allowDeactivate ? (
                      <LoadingButton
                        type="button"
                        loading={busy}
                        loadingLabel="…"
                        spinnerTone={plant.isActive ? "danger" : "dark"}
                        onClick={() => onToggleActive(plant)}
                        className={clsx(
                          "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                          plant.isActive
                            ? "border-red-500/40 bg-surface text-red-400 hover:bg-red-950/40"
                            : "border-primary/30 bg-surface text-primary hover:bg-primary/15",
                        )}
                      >
                        {plant.isActive ? "Deactivate" : "Reactivate"}
                      </LoadingButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onPageChange && total > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-xs text-text-muted">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="min-w-[4.5rem] text-center text-xs font-medium text-text">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
