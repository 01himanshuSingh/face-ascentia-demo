import { useState } from "react";

import type { AuditCategory, AuditLogItem } from "../../api/adminApi";
import { AuditEventDialog } from "./AuditEventDialog";
import { AuditFilters } from "./AuditFilters";
import { AuditLogTable } from "./AuditLogTable";

export type AuditLogPanelProps = {
  items: AuditLogItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  category: AuditCategory;
  searchInput: string;
  needsPlant: boolean;
  workspaceLabel: string | null;
  token: string;
  allowFace: boolean;
  onCategoryChange: (category: AuditCategory) => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
};

export function AuditLogPanel({
  items,
  loading,
  total,
  page,
  pageSize,
  totalPages,
  category,
  searchInput,
  needsPlant,
  workspaceLabel,
  token,
  allowFace,
  onCategoryChange,
  onSearchChange,
  onPageChange,
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
          Recent plant activity
          {workspaceLabel ? (
            <>
              {" "}
              for <span className="font-medium text-text">{workspaceLabel}</span>
            </>
          ) : null}
          . Open a row for details.
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
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onSelect={setSelected}
        onPageChange={onPageChange}
      />

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
