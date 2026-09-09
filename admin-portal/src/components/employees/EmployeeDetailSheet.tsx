import { useEffect, useId, useState } from "react";

import {
  formatCapturedAt,
  type AdminEmployeeItem,
  type EmployeeListStatus,
} from "../../api/adminApi";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 border-b border-border/60 py-3 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-text">{value}</dd>
    </div>
  );
}

export type EmployeeDetailSheetProps = {
  employee: AdminEmployeeItem;
  rosterStatus: EmployeeListStatus;
  busy: boolean;
  onClose: () => void;
  onRevoke: (employee: AdminEmployeeItem) => void;
};

/**
 * Mobile-only (&lt; md): bottom sheet with full employee row details.
 * Desktop keeps the table + inline Revoke — this sheet is not used there.
 */
export function EmployeeDetailSheet({
  employee,
  rosterStatus,
  busy,
  onClose,
  onRevoke,
}: EmployeeDetailSheetProps) {
  const titleId = useId();
  const [entered, setEntered] = useState(false);
  const isLeft = rosterStatus === "inactive";

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:hidden"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close employee details"
        className={`absolute inset-0 bg-text/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-[1.35rem] border border-border border-b-0 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 flex-col items-center px-4 pt-3 pb-2">
          <div
            className="mb-3 h-1 w-10 rounded-full bg-border"
            aria-hidden
          />
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                id={titleId}
                className="truncate font-mono text-base font-semibold leading-snug text-text"
              >
                {employee.employeeId}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-lg leading-none text-text-muted"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <dl className="mt-1">
            <DetailRow label="Employee ID" value={employee.employeeId} />
            <DetailRow
              label="Status"
              value={isLeft ? "Left" : "Active"}
            />
            {isLeft ? (
              <>
                <DetailRow
                  label="Left"
                  value={
                    employee.leftAt
                      ? formatCapturedAt(employee.leftAt)
                      : "—"
                  }
                />
                <DetailRow
                  label="Reason"
                  value={employee.revokedReason?.trim() || "—"}
                />
              </>
            ) : (
              <DetailRow
                label="Enrolled"
                value={
                  employee.enrolledAt
                    ? formatCapturedAt(employee.enrolledAt)
                    : "—"
                }
              />
            )}
          </dl>

          {!isLeft ? (
            <div className="mt-5 pb-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onRevoke(employee)}
                className="flex min-h-11 w-full items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                Revoke employee
              </button>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Stops face login and removes admin if any. Employee ID is kept
                for history.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              Face login stays blocked. Employee ID is kept for history.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
