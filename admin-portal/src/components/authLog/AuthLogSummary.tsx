import type { AuthLogSummaryResult } from "../../api/adminApi";

export type AuthLogSummaryProps = {
  summary: AuthLogSummaryResult | null;
  loading: boolean;
};

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-white/80 px-4 py-3.5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-text">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 truncate text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Daily Auth Log KPI strip — attempts / success / failed / rate (+ top failure).
 */
export function AuthLogSummary({ summary, loading }: AuthLogSummaryProps) {
  if (loading && !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["Attempts", "Success", "Failed", "Success rate"].map((label) => (
          <Kpi key={label} label={label} value="…" />
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const rate =
    summary.successRatePercent == null
      ? "—"
      : `${summary.successRatePercent}%`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Attempts" value={String(summary.totalAttempts)} />
      <Kpi label="Success" value={String(summary.successCount)} />
      <Kpi label="Failed" value={String(summary.failureCount)} />
      <Kpi
        label="Success rate"
        value={rate}
        hint={
          summary.topFailureReasonLabel
            ? `Top fail: ${summary.topFailureReasonLabel}`
            : null
        }
      />
    </div>
  );
}
