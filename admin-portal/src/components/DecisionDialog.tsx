import { useState, type FormEvent } from "react";
import clsx from "clsx";

export type DecisionDialogProps = {
  mode: "approve" | "reject";
  employeeId: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => Promise<void>;
};

export function DecisionDialog({
  mode,
  employeeId,
  busy,
  onCancel,
  onConfirm,
}: DecisionDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isApprove = mode === "approve";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isApprove && !reason.trim()) {
      setError("Reject reason is required.");
      return;
    }
    setError(null);
    void onConfirm(reason.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-text/40 p-4 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[1.5rem] glass-panel p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-text">
          {isApprove ? "Approve enrollment" : "Reject registration"}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {isApprove
            ? `Approve ${employeeId} and create an ACTIVE enrollment?`
            : `Reject registration for ${employeeId}. A reason is required.`}
        </p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-text">
          {isApprove ? "Note (optional)" : "Reason"}
          <textarea
            className="min-h-24 resize-y rounded-xl border border-border/80 bg-surface px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            disabled={busy}
          />
        </label>

        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-border/80 bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={clsx(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60",
              isApprove
                ? "bg-primary hover:bg-brand-700"
                : "bg-red-600 hover:bg-red-700",
            )}
          >
            {busy
              ? "Saving…"
              : isApprove
                ? "Confirm approve"
                : "Confirm reject"}
          </button>
        </div>
      </form>
    </div>
  );
}
