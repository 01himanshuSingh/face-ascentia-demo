import type {
  AuthLogItem,
  AuthLogResultFilter,
  AuthLogSummaryResult,
} from "../../api/adminApi";
import { AuthLogDetailSheet } from "./AuthLogDetailSheet";
import { AuthLogFilters } from "./AuthLogFilters";
import { AuthLogSummary } from "./AuthLogSummary";
import { AuthLogTable } from "./AuthLogTable";

export type AuthLogPanelProps = {
  items: AuthLogItem[];
  loading: boolean;
  summaryLoading: boolean;
  summary: AuthLogSummaryResult | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  result: AuthLogResultFilter;
  reasonCode: string;
  searchInput: string;
  from: string;
  to: string;
  needsPlant: boolean;
  workspaceLabel: string | null;
  selected: AuthLogItem | null;
  onResultChange: (result: AuthLogResultFilter) => void;
  onReasonCodeChange: (reasonCode: string) => void;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onSelect: (item: AuthLogItem) => void;
  onCloseDetail: () => void;
};

/**
 * Auth Log page shell — KPIs + filters + attempt list (dedicated sidebar tab).
 * Text only; never mixed with compliance Audit.
 */
export function AuthLogPanel({
  items,
  loading,
  summaryLoading,
  summary,
  total,
  page,
  pageSize,
  totalPages,
  result,
  reasonCode,
  searchInput,
  from,
  to,
  needsPlant,
  workspaceLabel,
  selected,
  onResultChange,
  onReasonCodeChange,
  onSearchChange,
  onFromChange,
  onToChange,
  onPageChange,
  onSelect,
  onCloseDetail,
}: AuthLogPanelProps) {
  if (needsPlant) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center text-sm leading-relaxed text-text-muted">
        Select a plant workspace (header toggle) to view kiosk authentication
        attempts for that plant.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-text">Auth log</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Kiosk face login attempts
          {workspaceLabel ? (
            <>
              {" "}
              for <span className="font-medium text-text">{workspaceLabel}</span>
            </>
          ) : null}
          . Success and failure with match % when a score was computed.
        </p>
      </div>

      <AuthLogSummary summary={summary} loading={summaryLoading} />

      <AuthLogFilters
        result={result}
        reasonCode={reasonCode}
        searchInput={searchInput}
        from={from}
        to={to}
        onResultChange={onResultChange}
        onReasonCodeChange={onReasonCodeChange}
        onSearchChange={onSearchChange}
        onFromChange={onFromChange}
        onToChange={onToChange}
      />

      <AuthLogTable
        items={items}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onSelect={onSelect}
        onPageChange={onPageChange}
      />

      {selected ? (
        <AuthLogDetailSheet item={selected} onClose={onCloseDetail} />
      ) : null}
    </div>
  );
}
