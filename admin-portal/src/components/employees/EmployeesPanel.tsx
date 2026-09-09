import { useState } from "react";

import type {
  AdminEmployeeItem,
  EmployeeListStatus,
} from "../../api/adminApi";
import { EmployeeDetailSheet } from "./EmployeeDetailSheet";
import { EmployeesTable } from "./EmployeesTable";
import { RevokeEmployeeDialog } from "./RevokeEmployeeDialog";

export type EmployeesPanelProps = {
  employees: AdminEmployeeItem[];
  total: number;
  loading: boolean;
  busy: boolean;
  rosterStatus: EmployeeListStatus;
  searchInput: string;
  needsPlant: boolean;
  workspaceLabel: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  onRosterStatusChange: (status: EmployeeListStatus) => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRevoke: (employeeId: string, reason: string) => Promise<void>;
};

const ROSTER_TABS: { id: EmployeeListStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Left" },
];

export function EmployeesPanel({
  employees,
  total,
  loading,
  busy,
  rosterStatus,
  searchInput,
  needsPlant,
  workspaceLabel,
  page,
  pageSize,
  totalPages,
  onRosterStatusChange,
  onSearchChange,
  onPageChange,
  onRevoke,
}: EmployeesPanelProps) {
  const [revokeTarget, setRevokeTarget] = useState<AdminEmployeeItem | null>(
    null,
  );
  const [detailEmployee, setDetailEmployee] =
    useState<AdminEmployeeItem | null>(null);

  if (needsPlant) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        Select a plant workspace (header toggle) to list and revoke enrolled
        workers for that plant.
      </div>
    );
  }

  const isLeft = rosterStatus === "inactive";

  return (
    <div className="space-y-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-text">Employees</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {isLeft
              ? "Workers who left or were revoked"
              : "Active enrolled workers"}
            {workspaceLabel ? (
              <>
                {" "}
                for <span className="font-medium text-text">{workspaceLabel}</span>
              </>
            ) : null}
            .{" "}
            {isLeft
              ? "Employee ID is kept for history; face login stays blocked."
              : "Revoke stops face login and removes admin if any — Employee ID stays in the database."}
          </p>
        </div>
        <span className="rounded-full bg-border/80 px-2.5 py-0.5 text-xs font-semibold text-text">
          {total}
        </span>
      </div>

      <div
        className="inline-flex rounded-lg border border-border bg-background p-1"
        role="tablist"
        aria-label="Employee roster"
      >
        {ROSTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={rosterStatus === tab.id}
            onClick={() => {
              setDetailEmployee(null);
              onRosterStatusChange(tab.id);
            }}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              rosterStatus === tab.id
                ? "bg-white text-text shadow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <label className="flex max-w-md flex-col gap-1.5 text-sm font-medium text-text">
        Search
        <input
          className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Employee ID"
          autoComplete="off"
        />
      </label>

      <EmployeesTable
        employees={employees}
        loading={loading}
        busy={busy}
        rosterStatus={rosterStatus}
        onRevoke={setRevokeTarget}
        onSelect={setDetailEmployee}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />

      {detailEmployee ? (
        <EmployeeDetailSheet
          employee={detailEmployee}
          rosterStatus={rosterStatus}
          busy={busy}
          onClose={() => setDetailEmployee(null)}
          onRevoke={(employee) => {
            setDetailEmployee(null);
            setRevokeTarget(employee);
          }}
        />
      ) : null}

      {revokeTarget ? (
        <RevokeEmployeeDialog
          employee={revokeTarget}
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
