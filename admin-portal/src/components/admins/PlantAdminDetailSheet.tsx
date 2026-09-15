import { useEffect, useId, useState } from "react";

import { formatCapturedAt, type AdminUserItem } from "../../api/adminApi";
import { LoadingButton } from "../ui/LoadingButton";

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

export type PlantAdminDetailSheetProps = {
  admin: AdminUserItem;
  busy: boolean;
  onClose: () => void;
  onUngrant: (admin: AdminUserItem) => void;
};

/**
 * Mobile-only (&lt; md): bottom sheet with full plant-admin row details.
 * Desktop keeps the table + inline Ungrant.
 */
export function PlantAdminDetailSheet({
  admin,
  busy,
  onClose,
  onUngrant,
}: PlantAdminDetailSheetProps) {
  const titleId = useId();
  const [entered, setEntered] = useState(false);

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
        aria-label="Close plant admin details"
        className={`absolute inset-0 bg-text/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-[1.35rem] border border-border border-b-0 bg-surface shadow-2xl transition-transform duration-300 ease-out ${
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
                {admin.employeeId}
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
            <DetailRow label="Employee ID" value={admin.employeeId} />
            <DetailRow
              label="Role"
              value={admin.role.replace(/_/g, " ")}
            />
            <DetailRow
              label="Granted"
              value={formatCapturedAt(admin.createdAt)}
            />
            <DetailRow
              label="Granted by"
              value={admin.grantedBy?.trim() || "—"}
            />
          </dl>

          <div className="mt-5 pb-2">
            <LoadingButton
              type="button"
              loading={busy}
              loadingLabel="Opening…"
              spinnerTone="danger"
              onClick={() => onUngrant(admin)}
              className="min-h-11 w-full rounded-xl border border-red-500/40 bg-surface px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/40"
            >
              Ungrant plant admin
            </LoadingButton>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Removes portal access only. They stay a worker — face login is
              unchanged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
