import { formatCapturedAt, type RegistrationQueueItem } from "../api/adminApi";

export type RequestDetailsProps = {
  item: RegistrationQueueItem | null;
  imageUrl: string | null;
  imageLoading: boolean;
  busy: boolean;
  /** Signed-in admin Employee ID — used in auto decision notes. */
  reviewerEmployeeId: string;
  onApprove: (reason?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
};

/**
 * System-generated decision note (no dialog).
 * Stored as registration decision_reason / audit metadata.
 */
export function buildAutoDecisionReason(
  action: "approved" | "rejected",
  reviewerEmployeeId: string,
  employeeId: string,
): string {
  const reviewer = reviewerEmployeeId.trim() || "ADMIN";
  const id = employeeId.trim() || "UNKNOWN";
  if (action === "approved") {
    return `Approved by ${reviewer}: ${id}`;
  }
  return `Rejected by ${reviewer}: ${id}`;
}

export function RequestDetails({
  item,
  imageUrl,
  imageLoading,
  busy,
  reviewerEmployeeId,
  onApprove,
  onReject,
}: RequestDetailsProps) {
  if (!item) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-[1.35rem] glass-panel px-6 text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 7h18M7 3v4M17 3v4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <rect
              x="3"
              y="7"
              width="18"
              height="14"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.75"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-text">Select a registration</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
          Choose a pending request from the queue to review the face capture and
          decide.
        </p>
      </div>
    );
  }

  const handleApprove = () => {
    const reason = buildAutoDecisionReason(
      "approved",
      reviewerEmployeeId,
      item.employeeId,
    );
    void onApprove(reason);
  };

  const handleReject = () => {
    const reason = buildAutoDecisionReason(
      "rejected",
      reviewerEmployeeId,
      item.employeeId,
    );
    void onReject(reason);
  };

  return (
    <div className="flex min-h-[28rem] flex-col rounded-[1.35rem] glass-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Registration details</h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Compare the capture against offline HR records, then decide.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[0.7rem] font-semibold text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          PENDING
        </span>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Face capture
        </p>
        <div className="grid min-h-56 place-items-center overflow-hidden rounded-[1.25rem] border border-white/60 bg-white/50 shadow-inner">
          {imageLoading ? (
            <div className="h-56 w-full skeleton-shimmer" aria-busy="true">
              <p className="sr-only">Loading photo…</p>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Registration capture"
              className="max-h-80 w-full object-contain transition duration-300"
            />
          ) : (
            <p className="px-4 text-sm text-text-muted">Photo unavailable.</p>
          )}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/50 px-3.5 py-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Employee ID
          </dt>
          <dd className="mt-1 text-sm font-semibold text-text">{item.employeeId}</dd>
        </div>
        <div className="rounded-2xl bg-white/50 px-3.5 py-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Plant
          </dt>
          <dd className="mt-1 text-sm text-text">
            {item.plantCode ?? item.plantName ?? item.plantId}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/50 px-3.5 py-3 sm:col-span-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Submitted
          </dt>
          <dd className="mt-1 text-sm text-text">{formatCapturedAt(item.capturedAt)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-3 pt-6">
        <button
          type="button"
          disabled={busy}
          onClick={handleApprove}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:min-w-[8.5rem]"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleReject}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:min-w-[8.5rem]"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
