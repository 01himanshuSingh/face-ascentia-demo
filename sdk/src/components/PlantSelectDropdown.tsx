import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import type { PlantListItem } from "../types/registration.types";

export type PlantSelectDropdownProps = {
  plants: PlantListItem[];
  value: string;
  onChange: (plantId: string) => void;
  disabled?: boolean;
  labelId?: string;
};

export function PlantSelectDropdown({
  plants,
  value,
  onChange,
  disabled = false,
  labelId,
}: PlantSelectDropdownProps): ReactElement {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const selected = useMemo(
    () => plants.find((plant) => plant.plantId === value) ?? null,
    [plants, value],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return plants;
    }
    return plants.filter(
      (plant) =>
        plant.plantName.toLowerCase().includes(query) ||
        plant.plantCode.toLowerCase().includes(query),
    );
  }, [plants, search]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setHighlightIndex(0);
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled || plants.length === 0) {
      return;
    }
    setOpen(true);
    const selectedIndex = filtered.findIndex((plant) => plant.plantId === value);
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, filtered, plants.length, value]);

  const selectPlant = useCallback(
    (plantId: string) => {
      onChange(plantId);
      close();
    },
    [close, onChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [close, open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (highlightIndex >= filtered.length) {
      setHighlightIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, highlightIndex]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      openDropdown();
    }
    if (event.key === "Escape") {
      close();
    }
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) =>
        filtered.length === 0 ? 0 : Math.min(current + 1, filtered.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && filtered[highlightIndex]) {
      event.preventDefault();
      selectPlant(filtered[highlightIndex].plantId);
    }
  };

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        type="button"
        id={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled || plants.length === 0}
        onClick={() => (open ? close() : openDropdown())}
        onKeyDown={onTriggerKeyDown}
        style={{
          ...styles.trigger,
          ...(open ? styles.triggerOpen : {}),
          ...(disabled ? styles.triggerDisabled : {}),
        }}
      >
        {selected ? (
          <span style={styles.triggerContent}>
            <span style={styles.triggerPrimary}>{selected.plantName}</span>
            <span style={styles.triggerSecondary}>{selected.plantCode}</span>
          </span>
        ) : (
          <span style={styles.placeholder}>Select plant</span>
        )}
        <span style={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div style={styles.popover}>
          <div style={styles.searchRow}>
            <span style={styles.searchIcon} aria-hidden>
              ⌕
            </span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search plants…"
              aria-label="Search plants"
              style={styles.searchInput}
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-activedescendant={
              filtered[highlightIndex]
                ? `${listboxId}-option-${filtered[highlightIndex].plantId}`
                : undefined
            }
            style={styles.list}
          >
            {filtered.length === 0 ? (
              <li style={styles.emptyItem}>No plants match your search.</li>
            ) : (
              filtered.map((plant, index) => {
                const isSelected = plant.plantId === value;
                const isHighlighted = index === highlightIndex;
                return (
                  <li key={plant.plantId} role="presentation">
                    <button
                      type="button"
                      id={`${listboxId}-option-${plant.plantId}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => selectPlant(plant.plantId)}
                      style={{
                        ...styles.option,
                        ...(isHighlighted ? styles.optionHighlighted : {}),
                        ...(isSelected ? styles.optionSelected : {}),
                      }}
                    >
                      <span style={styles.optionMarker} aria-hidden>
                        {isSelected ? "✓" : "○"}
                      </span>
                      <span style={styles.optionText}>
                        <span style={styles.optionName}>{plant.plantName}</span>
                        <span style={styles.optionCode}>{plant.plantCode}</span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
  },
  trigger: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 15,
    textAlign: "left",
    cursor: "pointer",
  },
  triggerOpen: {
    borderColor: "#1e3a5f",
    boxShadow: "0 0 0 3px rgba(30, 58, 95, 0.12)",
  },
  triggerDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    background: "#f8fafc",
  },
  triggerContent: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  triggerPrimary: {
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  triggerSecondary: {
    fontSize: 13,
    color: "#64748b",
    letterSpacing: "0.02em",
  },
  placeholder: {
    color: "#94a3b8",
    fontWeight: 400,
  },
  chevron: {
    color: "#64748b",
    fontSize: 14,
    flexShrink: 0,
  },
  popover: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 20,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
    overflow: "hidden",
    maxHeight: "min(320px, 50vh)",
    display: "flex",
    flexDirection: "column",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  searchIcon: {
    color: "#64748b",
    fontSize: 16,
    lineHeight: 1,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    color: "#0f172a",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: "6px 0",
    overflowY: "auto",
  },
  emptyItem: {
    padding: "14px 16px",
    fontSize: 14,
    color: "#64748b",
  },
  option: {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  optionHighlighted: {
    background: "#f1f5f9",
  },
  optionSelected: {
    background: "#eef4fb",
  },
  optionMarker: {
    width: 16,
    flexShrink: 0,
    color: "#1e3a5f",
    fontSize: 13,
    lineHeight: "20px",
  },
  optionText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  optionName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.35,
  },
  optionCode: {
    fontSize: 12,
    color: "#64748b",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
};
