import clsx from "clsx";

import { formatCapturedAt, type RegistrationQueueItem } from "../api/adminApi";

export type RequestTableProps = {
  items: RegistrationQueueItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (requestId: string) => void;
  needsPlant?: boolean;
  workspaceLabel?: string | null;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

export function RequestTable({
  items,
  selectedId,
  loading,
  onSelect,
  needsPlant = false,
  workspaceLabel = null,
  total = 0,
  page = 1,
  pageSize = 15,
  totalPages = 1,
  onPageChange,
}: RequestTableProps) {
  if (needsPlant) {
    return (
      <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-[1.35rem] glass-panel px-6 py-12 text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary/15 text-secondary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-text">Select a plant workspace</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
          Choose a plant in the header to load pending registration requests for
          that workspace.
        </p>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3 rounded-[1.35rem] glass-panel p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-[4.25rem] rounded-2xl skeleton-shimmer"
            aria-hidden
          />
        ))}
        <p className="sr-only">Loading pending registrations…</p>
      </div>
    );
  }

  if (!loading && total === 0) {
    return (
      <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-[1.35rem] glass-panel px-6 py-12 text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path
              d="m9 12 2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-text">No pending registrations</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
          There are currently no registration requests waiting for review
          {workspaceLabel ? ` for ${workspaceLabel}` : ""}.
        </p>
      </div>
    );
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-[1.35rem] glass-panel">
      <div className="flex items-center justify-between gap-3 border-b border-white/50 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Pending registrations</h2>
          {workspaceLabel ? (
            <p className="mt-0.5 text-xs text-text-muted">{workspaceLabel}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[0.7rem] font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Pending review
          </span>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-text">
            {total}
          </span>
        </div>
      </div>

      <ul className="max-h-[min(32rem,52vh)] space-y-2 overflow-y-auto p-3">
        {items.map((item) => {
          const selected = item.requestId === selectedId;
          return (
            <li key={item.requestId}>
              <button
                type="button"
                onClick={() => onSelect(item.requestId)}
                className={clsx(
                  "w-full rounded-2xl border px-4 py-3 text-left transition duration-200",
                  selected
                    ? "border-primary/20 bg-primary/[0.07] shadow-sm"
                    : "border-transparent bg-white/45 hover:border-border/60 hover:bg-white/80",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={clsx(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      selected ? "bg-primary" : "bg-secondary/80",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-text">
                        {item.employeeId}
                      </p>
                      <p className="text-[0.7rem] text-text-muted">
                        {formatCapturedAt(item.capturedAt)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-muted">
                      {item.submittedFullName}
                    </p>
                    <p className="mt-1.5 inline-flex rounded-md bg-background/80 px-2 py-0.5 text-[0.7rem] font-medium text-text">
                      {item.plantCode ??
                        item.plantName ??
                        item.plantId.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {onPageChange && total > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/50 px-4 py-3">
          <p className="text-xs text-text-muted">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-border/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-text transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-lg border border-border/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-text transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
