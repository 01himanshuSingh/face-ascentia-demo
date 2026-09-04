import { useState } from "react";

import type { AdminUserItem } from "../../api/adminApi";
import { PlantAdminsTable } from "./PlantAdminsTable";
import { RevokeAdminDialog } from "./RevokeAdminDialog";

export type PlantAdminsPanelProps = {
  admins: AdminUserItem[];
  total: number;
  loading: boolean;
  busy: boolean;
  searchInput: string;
  needsPlant: boolean;
  workspaceLabel: string | null;
  onSearchChange: (value: string) => void;
  onRevoke: (employeeId: string, reason?: string) => Promise<void>;
};

export function PlantAdminsPanel({
  admins,
  total,
  loading,
  busy,
  searchInput,
  needsPlant,
  workspaceLabel,
  onSearchChange,
  onRevoke,
}: PlantAdminsPanelProps) {
  const [revokeTarget, setRevokeTarget] = useState<AdminUserItem | null>(null);

  if (needsPlant) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        Select a plant workspace (header toggle) to list and ungrant plant
        admins for that plant.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-text">Plant admins</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Active PLANT_ADMIN users
            {workspaceLabel ? (
              <>
                {" "}
                for <span className="font-medium text-text">{workspaceLabel}</span>
              </>
            ) : null}
            . Ungrant removes portal access only — the person stays a worker.
          </p>
        </div>
        <span className="rounded-full bg-border/80 px-2.5 py-0.5 text-xs font-semibold text-text">
          {total}
        </span>
      </div>

      <label className="flex max-w-md flex-col gap-1.5 text-sm font-medium text-text">
        Search
        <input
          className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Employee ID or name"
          autoComplete="off"
        />
      </label>

      <PlantAdminsTable
        admins={admins}
        loading={loading}
        busy={busy}
        onRevoke={setRevokeTarget}
      />

      {revokeTarget ? (
        <RevokeAdminDialog
          admin={revokeTarget}
          busy={busy}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={async (reason) => {
            await onRevoke(revokeTarget.employeeId, reason);
            setRevokeTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
