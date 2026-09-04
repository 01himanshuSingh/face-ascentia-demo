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
};

export function AuditLogTable({ items, loading, onSelect }: AuditLogTableProps) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-text-muted">
        Loading audit events…
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No audit events in this plant for the selected filters (default last 7
        days).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
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
  );
}
