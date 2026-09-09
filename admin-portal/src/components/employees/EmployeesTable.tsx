import {
  formatCapturedAt,
  type AdminEmployeeItem,
  type EmployeeListStatus,
} from "../../api/adminApi";
import { LoadingButton } from "../ui/LoadingButton";

export type EmployeesTableProps = {
  employees: AdminEmployeeItem[];
  loading: boolean;
  busy: boolean;
  rosterStatus: EmployeeListStatus;
  onRevoke: (employee: AdminEmployeeItem) => void;
  /** Mobile list row tap → open bottom sheet with full details. */
  onSelect: (employee: AdminEmployeeItem) => void;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

export function EmployeesTable({
  employees,
  loading,
  busy,
  rosterStatus,
  onRevoke,
  onSelect,
  total = 0,
  page = 1,
  pageSize = 15,
  totalPages = 1,
  onPageChange,
}: EmployeesTableProps) {
  const isLeft = rosterStatus === "inactive";

  if (loading && employees.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-text-muted">
        Loading employees…
      </div>
    );
  }

  if (!loading && total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        {isLeft
          ? "No inactive workers in this plant yet. Revoke an active employee to see them here."
          : "No active enrolled workers in this plant. Approve a registration or enroll via kiosk first."}
      </div>
    );
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pagination =
    onPageChange && total > pageSize ? (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-text-muted">
          Showing {rangeStart}–{rangeEnd} of {total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
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
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      {/* Mobile compact list — tap opens bottom sheet */}
      <ul className="divide-y divide-border md:hidden">
        {employees.map((employee) => (
          <li key={employee.employeeId}>
            <button
              type="button"
              onClick={() => onSelect(employee)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-background/80"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-text">
                  {employee.employeeId}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {isLeft
                    ? employee.leftAt
                      ? `Inactive ${formatCapturedAt(employee.leftAt)}`
                      : "Inactive"
                    : employee.enrolledAt
                      ? `Enrolled ${formatCapturedAt(employee.enrolledAt)}`
                      : "Enrolled"}
                </p>
              </div>
              <span
                className="shrink-0 text-lg leading-none text-text-muted"
                aria-hidden
              >
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Employee ID</th>
              {isLeft ? (
                <>
                  <th className="px-4 py-3 font-semibold">Inactive</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 font-semibold">Enrolled</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr
                key={employee.employeeId}
                className="border-b border-border/70 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-text">
                  {employee.employeeId}
                </td>
                {isLeft ? (
                  <>
                    <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                      {employee.leftAt
                        ? formatCapturedAt(employee.leftAt)
                        : "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-text-muted">
                      {employee.revokedReason?.trim() || "—"}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                      {employee.enrolledAt
                        ? formatCapturedAt(employee.enrolledAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <LoadingButton
                        type="button"
                        loading={busy}
                        loadingLabel="…"
                        spinnerTone="danger"
                        onClick={() => onRevoke(employee)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Revoke
                      </LoadingButton>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination}
    </div>
  );
}
