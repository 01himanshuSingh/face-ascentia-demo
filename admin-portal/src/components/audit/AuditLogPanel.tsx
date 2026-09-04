import { useState } from "react";

import type { AuditCategory, AuditLogItem } from "../../api/adminApi";
import { AuditEventDialog } from "./AuditEventDialog";
import { AuditFilters } from "./AuditFilters";
import { AuditLogTable } from "./AuditLogTable";

export type AuditLogPanelProps = {
  items: AuditLogItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  category: AuditCategory;
  searchInput: string;
  needsPlant: boolean;
  workspaceLabel: string | null;
  token: string;
  allowFace: boolean;
  onCategoryChange: (category: AuditCategory) => void;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
};

export function AuditLogPanel({
  items,
  loading,
  loadingMore,
  hasMore,
  category,
  searchInput,
  needsPlant,
  workspaceLabel,
  token,
  allowFace,
  onCategoryChange,
  onSearchChange,
  onLoadMore,
}: AuditLogPanelProps) {
  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  if (needsPlant) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        Select a plant workspace (header toggle) to view the audit timeline for
        that plant.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-text">Audit log</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Plant-scoped compliance events
          {workspaceLabel ? (
            <>
              {" "}
              for <span className="font-medium text-text">{workspaceLabel}</span>
            </>
          ) : null}
          . Text timeline only — open a row for details
          {allowFace
            ? "; Portal approved / Kiosk approved can show the face photo"
            : ""}
          .
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text">Portal approved</span> = desk
          review of a pending registration.{" "}
          <span className="font-medium text-text">Kiosk approved</span> = plant
          admin enrolled the worker directly at the kiosk (no pending queue).
        </p>
      </div>

      <AuditFilters
        category={category}
        searchInput={searchInput}
        onCategoryChange={onCategoryChange}
        onSearchChange={onSearchChange}
      />

      <AuditLogTable
        items={items}
        loading={loading}
        onSelect={setSelected}
      />

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onLoadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {selected ? (
        <AuditEventDialog
          item={selected}
          token={token}
          allowFace={allowFace}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
