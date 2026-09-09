import { useEffect, useId, useState } from "react";

import { formatCapturedAt, type AuthLogItem } from "../../api/adminApi";

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

export type AuthLogDetailSheetProps = {
  item: AuthLogItem;
  onClose: () => void;
};

/**
 * Text-only Auth Log detail — mobile bottom sheet + desktop dialog.
 * No face images.
 */
export function AuthLogDetailSheet({ item, onClose }: AuthLogDetailSheetProps) {
  const titleId = useId();
  const [entered, setEntered] = useState(false);
  const success = item.result === "SUCCESS";

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

  const matchDisplay =
    item.matchPercent == null ? "—" : `${item.matchPercent}%`;
  const thresholdDisplay =
    item.threshold == null
      ? "—"
      : `${Math.round(Math.max(0, Math.min(1, item.threshold)) * 100)}%`;

  const body = (
    <dl>
      <DetailRow label="Employee ID" value={item.employeeId} />
      <DetailRow label="Result" value={success ? "Success" : "Failed"} />
      <DetailRow label="Reason" value={item.reasonLabel} />
      <DetailRow label="Reason code" value={String(item.reasonCode)} />
      <DetailRow label="Match" value={matchDisplay} />
      <DetailRow label="Threshold" value={thresholdDisplay} />
      <DetailRow label="When" value={formatCapturedAt(item.createdAt)} />
      {item.message ? (
        <DetailRow label="Message" value={item.message} />
      ) : null}
    </dl>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="Close auth log details"
        className={`absolute inset-0 bg-text/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[min(88dvh,40rem)] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-white shadow-xl transition duration-200 md:rounded-2xl ${
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-6 opacity-0 md:translate-y-2"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
              Auth attempt
            </p>
            <h2
              id={titleId}
              className="mt-1 truncate text-lg font-semibold text-text"
            >
              {item.employeeId}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-text transition hover:bg-background"
          >
            Close
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-2">{body}</div>
      </div>
    </div>
  );
}
