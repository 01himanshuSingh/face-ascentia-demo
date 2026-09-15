import clsx from "clsx";

import { formatCapturedAt, type AuthLogItem } from "../../api/adminApi";

export type AuthLogTableProps = {
  items: AuthLogItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onSelect: (item: AuthLogItem) => void;
  onPageChange: (page: number) => void;
};

function ResultBadge({ result }: { result: AuthLogItem["result"] }) {
  const success = result === "SUCCESS";
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
        success
          ? "bg-primary/10 text-primary"
          : "bg-red-950/40 text-red-400",
      )}
    >
      {success ? "Success" : "Failed"}
    </span>
  );
}

function MatchCell({ percent }: { percent: number | null }) {
  if (percent == null) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="font-semibold tabular-nums text-text">{percent}%</span>
  );
}

function PaginationBar({
  total,
  page,
  pageSize,
  totalPages,
  loading,
  onPageChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-text-muted">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
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
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * Auth Log list — mobile cards + desktop table (text + matchPercent).
 */
export function AuthLogTable({
  items,
  loading,
  total,
  page,
  pageSize,
  totalPages,
  onSelect,
  onPageChange,
}: AuthLogTableProps) {
  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
        Loading authentication attempts…
      </div>
    );
  }

  if (!loading && total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        No authentication attempts for this plant with the selected filters
        (default: today UTC).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <li key={item.logId}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left transition active:bg-background/80"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug text-text">
                  {item.employeeId}
                </p>
                <ResultBadge result={item.result} />
              </div>
              <p className="text-sm text-text">
                <span className="text-text-muted">Reason </span>
                <span className="font-medium">{item.reasonLabel}</span>
              </p>
              <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
                <span>{formatCapturedAt(item.createdAt)}</span>
                <MatchCell percent={item.matchPercent} />
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Employee ID</th>
              <th className="px-4 py-3 font-semibold">Result</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Match</th>
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
                  {item.employeeId}
                </td>
                <td className="px-4 py-3">
                  <ResultBadge result={item.result} />
                </td>
                <td className="px-4 py-3 text-text">
                  <span className="font-medium">{item.reasonLabel}</span>
                  <span className="mt-0.5 block text-xs font-normal text-text-muted">
                    {item.reasonCode}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <MatchCell percent={item.matchPercent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        loading={loading}
        onPageChange={onPageChange}
      />
    </div>
  );
}
