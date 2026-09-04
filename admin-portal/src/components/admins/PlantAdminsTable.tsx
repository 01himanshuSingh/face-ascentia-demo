import { formatCapturedAt, type AdminUserItem } from "../../api/adminApi";

export type PlantAdminsTableProps = {
  admins: AdminUserItem[];
  loading: boolean;
  busy: boolean;
  onRevoke: (admin: AdminUserItem) => void;
};

export function PlantAdminsTable({
  admins,
  loading,
  busy,
  onRevoke,
}: PlantAdminsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm text-text-muted">
        Loading plant admins…
      </div>
    );
  }

  if (admins.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No active plant admins for this workspace. Grant a worker from the
        Grant admin tab, or clear the search.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
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
                    disabled={busy}
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
    </div>
  );
}
