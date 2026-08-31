import clsx from "clsx";

import { formatCapturedAt, type RegistrationQueueItem } from "../api/adminApi";

export type RequestTableProps = {
  items: RegistrationQueueItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (requestId: string) => void;
};

export function RequestTable({
  items,
  selectedId,
  loading,
  onSelect,
}: RequestTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading pending registrations…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm leading-relaxed text-slate-500">
        No pending registrations. Register a worker from the test harness, then
        refresh.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plant</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const selected = item.requestId === selectedId;
              return (
                <tr
                  key={item.requestId}
                  onClick={() => onSelect(item.requestId)}
                  className={clsx(
                    "cursor-pointer border-b border-slate-100 transition last:border-b-0",
                    selected
                      ? "bg-brand-50/80"
                      : "hover:bg-slate-50",
                  )}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.employeeId}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.submittedFullName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {item.plantCode ??
                        item.plantName ??
                        item.plantId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatCapturedAt(item.capturedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
