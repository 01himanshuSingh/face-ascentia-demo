import { formatCapturedAt, type AuditLogItem } from "../../api/adminApi";

function metaString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function auditActionLabel(action: string): string {
  switch (action) {
    case "APPROVE":
      return "Approved by Admin Portal";
    case "REJECT":
      return "Rejected (Admin Portal)";
    case "ADMIN_GRANT":
      return "Granted admin";
    case "REVOKE":
      return "Ungranted admin";
    case "ADMIN_KIOSK_ENROLL":
      return "Approved by Kiosk (direct enroll)";
    case "EMPLOYEE_REVOKE":
      return "Employee revoked";
    case "PLANT_CREATE":
      return "Plant created";
    case "PLANT_UPDATE":
      return "Plant updated";
    case "PLANT_DEACTIVATE":
      return "Plant deactivated";
    default:
      return action.replace(/_/g, " ");
  }
}

export function auditSubject(item: AuditLogItem): string {
  const fromMeta =
    metaString(item.metadata, "employee_id") ??
    metaString(item.metadata, "plant_code");
  if (fromMeta) {
    return fromMeta;
  }
  return item.targetId ?? "—";
}

export type AuditLogTableProps = {
  items: AuditLogItem[];
  loading: boolean;
  onSelect: (item: AuditLogItem) => void;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

function PaginationBar({
  total,
  page,
  pageSize,
  totalPages,
  loading,
  onPageChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
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
  );
}

export function AuditLogTable({
  items,
  loading,
  onSelect,
  total = 0,
  page = 1,
  pageSize = 15,
  totalPages = 1,
  onPageChange,
}: AuditLogTableProps) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-text-muted">
        Loading audit events…
      </div>
    );
  }

  if (!loading && total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No audit events in this plant for the selected filters (default last 7
        days).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      {/* Mobile card list */}
      <ul className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <li key={item.logId}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left transition active:bg-background/80"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug text-text">
                  {auditActionLabel(item.action)}
                </p>
                <span className="shrink-0 text-xs text-text-muted">
                  {formatCapturedAt(item.createdAt)}
                </span>
              </div>
              <p className="text-sm text-text">
                <span className="text-text-muted">Subject </span>
                <span className="font-medium">{auditSubject(item)}</span>
              </p>
              <p className="text-xs text-text-muted">
                {item.actorId ?? "—"}
                {item.actorRole
                  ? ` · ${item.actorRole.replace(/_/g, " ")}`
                  : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Subject</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.logId}
                className="cursor-pointer border-b border-border/70 last:border-0 transition hover:bg-background/80"
                onClick={() => onSelect(item)}
              >
                <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                  {formatCapturedAt(item.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium text-text">
                  {item.actorId ?? "—"}
                  {item.actorRole ? (
                    <span className="mt-0.5 block text-xs font-normal text-text-muted">
                      {item.actorRole.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-text">
                  {auditActionLabel(item.action)}
                </td>
                <td className="px-4 py-3 font-medium text-text">
                  {auditSubject(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onPageChange ? (
        <PaginationBar
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          loading={loading}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
