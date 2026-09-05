import { useState, type FormEvent } from "react";

import type { AdminEmployeeItem } from "../../api/adminApi";

export type RevokeEmployeeDialogProps = {
  employee: AdminEmployeeItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function RevokeEmployeeDialog({
  employee,
  busy,
  onCancel,
  onConfirm,
}: RevokeEmployeeDialogProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    void onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-text/50 p-4 backdrop-blur-[2px]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-text">Revoke employee</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Soft-revoke{" "}
          <span className="font-medium text-text">
            {employee.fullName} ({employee.employeeId})
          </span>
          . This will set the employee inactive, revoke their face enrollment,
          and ungrant admin access if they have it. Face login will fail.
          History is kept — the Employee ID is not deleted.
        </p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-text">
          Reason (required)
          <textarea
            className="min-h-20 resize-y rounded-lg border border-border px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            disabled={busy}
            required
            placeholder="e.g. Left plant / access removed by HR"
          />
        </label>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Revoking…" : "Revoke"}
          </button>
        </div>
      </form>
    </div>
  );
}
