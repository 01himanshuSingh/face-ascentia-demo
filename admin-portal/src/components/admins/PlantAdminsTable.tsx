import { formatCapturedAt, type AdminUserItem } from "../../api/adminApi";

export type PlantAdminsTableProps = {
  admins: AdminUserItem[];
  loading: boolean;
  busy: boolean;
  onRevoke: (admin: AdminUserItem) => void;
  /** Mobile list row tap → open bottom sheet with full details. */
  onSelect: (admin: AdminUserItem) => void;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

function SkeletonRows() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-white p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-[3.25rem] rounded-xl skeleton-shimmer"
          aria-hidden
        />
      ))}
      <p className="sr-only">Loading plant admins…</p>
    </div>
  );
}

export function PlantAdminsTable({
  admins,
  loading,
  busy,
  onRevoke,
  onSelect,
  total = 0,
  page = 1,
  pageSize = 15,
  totalPages = 1,
  onPageChange,
}: PlantAdminsTableProps) {
  if (loading && admins.length === 0) {
    return <SkeletonRows />;
  }

  if (!loading && total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No active plant admins for this workspace. Grant a worker from the
        Grant admin tab, or clear the search.
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
    <div
      className={`overflow-hidden rounded-xl border border-border bg-white shadow-sm transition ${
        loading ? "opacity-70" : "opacity-100"
      }`}
    >
      {/* Mobile compact list — tap opens bottom sheet */}
      <ul className="divide-y divide-border md:hidden">
        {admins.map((admin) => (
          <li key={admin.employeeId}>
            <button
              type="button"
              onClick={() => onSelect(admin)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-background/80"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {admin.fullName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-muted">
                  {admin.employeeId}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {admin.role.replace(/_/g, " ")}
                  {" · "}
                  Granted {formatCapturedAt(admin.createdAt)}
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
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Granted</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr
                key={admin.employeeId}
                className="border-b border-background last:border-b-0"
              >
                <td className="px-4 py-3 font-medium text-text">
                  {admin.employeeId}
                </td>
                <td className="px-4 py-3 text-text">{admin.fullName}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-md bg-background px-2 py-0.5 text-xs font-medium text-text">
                    {admin.role.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {formatCapturedAt(admin.createdAt)}
                  {admin.grantedBy ? (
                    <span className="mt-0.5 block text-xs">
                      by {admin.grantedBy}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => onRevoke(admin)}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Ungrant
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination}
    </div>
  );
}
