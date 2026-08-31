import { useState } from "react";

import { formatCapturedAt, type RegistrationQueueItem } from "../api/adminApi";
import { DecisionDialog } from "./DecisionDialog";

export type RequestDetailsProps = {
  item: RegistrationQueueItem | null;
  imageUrl: string | null;
  imageLoading: boolean;
  busy: boolean;
  onApprove: (reason?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
};

export function RequestDetails({
  item,
  imageUrl,
  imageLoading,
  busy,
  onApprove,
  onReject,
}: RequestDetailsProps) {
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | null>(
    null,
  );

  if (!item) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center text-sm text-slate-500">
        Select a registration to review.
      </div>
    );
  }

  return (
    <div className="min-h-[28rem] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Registration review
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Compare the capture against offline HR records, then decide.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
          PENDING
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-medium text-slate-500">Employee ID</dt>
          <dd className="font-semibold text-slate-900">{item.employeeId}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-medium text-slate-500">Full name</dt>
          <dd className="text-slate-800">{item.submittedFullName}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-medium text-slate-500">Plant</dt>
          <dd className="text-slate-800">
            {item.plantCode ?? item.plantName ?? item.plantId}
          </dd>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-medium text-slate-500">Submitted</dt>
          <dd className="text-slate-800">
            {formatCapturedAt(item.capturedAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 grid min-h-56 place-items-center overflow-hidden rounded-xl bg-slate-100">
        {imageLoading ? (
          <p className="text-sm text-slate-500">Loading photo…</p>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Registration capture"
            className="max-h-80 w-full object-contain"
          />
        ) : (
          <p className="text-sm text-slate-500">Photo unavailable.</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => setDialogMode("approve")}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setDialogMode("reject")}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {dialogMode ? (
        <DecisionDialog
          mode={dialogMode}
          employeeId={item.employeeId}
          busy={busy}
          onCancel={() => setDialogMode(null)}
          onConfirm={async (reason) => {
            if (dialogMode === "approve") {
              await onApprove(reason);
            } else {
              await onReject(reason ?? "");
            }
            setDialogMode(null);
          }}
        />
      ) : null}
    </div>
  );
}
