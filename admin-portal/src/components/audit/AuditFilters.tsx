import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";

import type { AuditCategory } from "../../api/adminApi";

const CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approved", label: "Portal approved" },
  { id: "rejected", label: "Rejected" },
  { id: "admins", label: "Admins" },
  { id: "kiosk", label: "Kiosk approved" },
  { id: "employees", label: "Revoked employees" },
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected =
    CATEGORIES.find((item) => item.id === category) ?? CATEGORIES[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Category</span>

        {/* Mobile: collapsed toggle → expands full category list */}
        <div ref={rootRef} className="relative md:hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 py-3 text-left text-sm font-medium text-text shadow-sm transition active:bg-background"
          >
            <span className="min-w-0 truncate">{selected.label}</span>
            <span
              className={clsx(
                "shrink-0 text-text-muted transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden
            >
              ▾
            </span>
          </button>

          {open ? (
            <div
              id={panelId}
              role="listbox"
              aria-label="Audit categories"
              className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
            >
              <ul className="max-h-[min(22rem,70dvh)] overflow-y-auto overscroll-contain py-1">
                {CATEGORIES.map((item) => {
                  const isSelected = category === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onCategoryChange(item.id);
                          setOpen(false);
                        }}
                        className={clsx(
                          "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm transition active:bg-background",
                          isSelected
                            ? "bg-brand-50 font-semibold text-brand-800"
                            : "font-medium text-text",
                        )}
                      >
                        <span className="leading-snug">{item.label}</span>
                        {isSelected ? (
                          <span className="shrink-0 text-primary" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Desktop: wrapping segment group */}
        <div
          className="hidden md:inline-flex md:flex-wrap md:rounded-lg md:border md:border-border md:bg-background md:p-1"
          role="group"
          aria-label="Audit category"
        >
          {CATEGORIES.map((item) => {
            const isSelected = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onCategoryChange(item.id)}
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

      <label className="flex w-full min-w-0 flex-col gap-1.5 text-sm font-medium text-text md:min-w-[14rem] md:flex-1">
        Search
        <input
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:rounded-lg"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Actor or employee ID"
          autoComplete="off"
          inputMode="search"
        />
      </label>
    </div>
  );
}
