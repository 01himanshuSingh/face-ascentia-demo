import clsx from "clsx";

import type {
  AuthLogReasonCode,
  AuthLogResultFilter,
} from "../../api/adminApi";

const RESULT_OPTIONS: { id: AuthLogResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "SUCCESS", label: "Success" },
  { id: "FAILURE", label: "Failed" },
];

/** Common reason filters for ops; empty = any reason. */
const REASON_OPTIONS: { id: "" | AuthLogReasonCode; label: string }[] = [
  { id: "", label: "Any reason" },
  { id: "MATCH_OK", label: "Authenticated" },
  { id: "FACE_MISMATCH", label: "Face did not match" },
  { id: "EMPLOYEE_INACTIVE", label: "Employee inactive" },
  { id: "ENROLLMENT_NOT_FOUND", label: "No active enrollment" },
  { id: "NO_FACE", label: "No face detected" },
  { id: "MULTIPLE_FACES", label: "Multiple faces" },
  { id: "EMPLOYEE_NOT_FOUND", label: "Employee not found" },
];

export type AuthLogFiltersProps = {
  result: AuthLogResultFilter;
  reasonCode: string;
  searchInput: string;
  from: string;
  to: string;
  onResultChange: (result: AuthLogResultFilter) => void;
  onReasonCodeChange: (reasonCode: string) => void;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

function toDateInputValue(iso: string): string {
  if (!iso) {
    return "";
  }
  return iso.slice(0, 10);
}

function fromDateInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `${trimmed}T00:00:00.000Z`;
}

/** Exclusive end = start of next UTC day (matches backend created_at < to). */
function toDateInputExclusive(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const next = new Date(`${trimmed}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function exclusiveIsoToDateInput(iso: string): string {
  if (!iso) {
    return "";
  }
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) {
    return "";
  }
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/**
 * Auth Log filters — result chips, reason, employee ID, optional day range.
 * Empty dates → backend default (today UTC).
 */
export function AuthLogFilters({
  result,
  reasonCode,
  searchInput,
  from,
  to,
  onResultChange,
  onReasonCodeChange,
  onSearchChange,
  onFromChange,
  onToChange,
}: AuthLogFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Result</span>
        <div
          className="inline-flex flex-wrap rounded-lg border border-border bg-background p-1"
          role="group"
          aria-label="Auth result"
        >
          {RESULT_OPTIONS.map((item) => {
            const isSelected = result === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onResultChange(item.id)}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  isSelected
                    ? "bg-white text-text shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-text">
          Reason
          <select
            className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:rounded-lg"
            value={reasonCode}
            onChange={(event) => onReasonCodeChange(event.target.value)}
          >
            {REASON_OPTIONS.map((item) => (
              <option key={item.id || "any"} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-text">
          Employee ID
          <input
            className="rounded-xl border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:rounded-lg md:text-sm"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Employee ID"
            autoComplete="off"
            inputMode="search"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-text">
          From (UTC)
          <input
            type="date"
            className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:rounded-lg"
            value={toDateInputValue(from)}
            onChange={(event) => onFromChange(fromDateInput(event.target.value))}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-text">
          To (UTC)
          <input
            type="date"
            className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:rounded-lg"
            value={exclusiveIsoToDateInput(to)}
            onChange={(event) =>
              onToChange(toDateInputExclusive(event.target.value))
            }
          />
        </label>
      </div>
    </div>
  );
}
