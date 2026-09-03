import clsx from "clsx";

import {
  formatCapturedAt,
  type AdminPlantItem,
} from "../../api/adminApi";

export type PlantCatalogTableProps = {
  plants: AdminPlantItem[];
  loading: boolean;
  busy: boolean;
  allowDeactivate: boolean;
  onEdit: (plant: AdminPlantItem) => void;
  onToggleActive: (plant: AdminPlantItem) => void;
};

export function PlantCatalogTable({
  plants,
  loading,
  busy,
  allowDeactivate,
  onEdit,
  onToggleActive,
}: PlantCatalogTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm text-text-muted">
        Loading plant catalog…
      </div>
    );
  }

  if (plants.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No plants yet. Create the first plant to open a workspace for
        registration review and plant admins.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
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
                        ? "bg-brand-50 text-brand-800"
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
                      className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:opacity-60"
                    >
                      Edit
                    </button>
                    {allowDeactivate ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onToggleActive(plant)}
                        className={clsx(
                          "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60",
                          plant.isActive
                            ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                            : "border-brand-100 bg-white text-brand-800 hover:bg-brand-50",
                        )}
                      >
                        {plant.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
