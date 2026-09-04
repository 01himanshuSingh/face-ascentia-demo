import type { AuditCategory } from "../../api/adminApi";

const CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approved", label: "Portal approved" },
  { id: "rejected", label: "Rejected" },
  { id: "admins", label: "Admins" },
  { id: "kiosk", label: "Kiosk approved" },
  { id: "plants", label: "Plants" },
];

export type AuditFiltersProps = {
  category: AuditCategory;
  searchInput: string;
  onCategoryChange: (category: AuditCategory) => void;
  onSearchChange: (value: string) => void;
};

export function AuditFilters({
  category,
  searchInput,
  onCategoryChange,
  onSearchChange,
}: AuditFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Category</span>
        <div
          className="inline-flex flex-wrap rounded-lg border border-border bg-background p-1"
          role="group"
          aria-label="Audit category"
        >
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onCategoryChange(item.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                category === item.id
                  ? "bg-white text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm font-medium text-text">
        Search
        <input
          className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Actor or target / employee ID"
          autoComplete="off"
        />
      </label>
    </div>
  );
}
