import clsx from "clsx";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { BrandLogo } from "../BrandLogo";

const SIDEBAR_COLLAPSED_KEY = "faceAuth.adminSidebarCollapsed";

export type DashboardTab =
  | "review"
  | "grant"
  | "plants"
  | "admins"
  | "audit"
  | "authLog"
  | "employees";

export type SidebarNavItem = {
  id: DashboardTab;
  label: string;
  icon: ReactNode;
};

/** Enrollment vs Auth — shown under a single Audit Log sidebar button. */
export type AuditMenuOption = {
  id: "audit" | "authLog";
  label: string;
  description: string;
  icon: ReactNode;
};

export type DashboardSidebarProps = {
  items: SidebarNavItem[];
  /** When non-empty, render one Audit Log control with these two destinations. */
  auditMenuOptions?: AuditMenuOption[];
  activeTab: DashboardTab;
  employeeId: string;
  roleLabel: string;
  plantLabel: string;
  mobileOpen: boolean;
  onNavigate: (tab: DashboardTab) => void;
  onCloseMobile: () => void;
  onSignOut: () => void;
};

function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconUserPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12a9 9 0 1 0 3-6.7L3 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconAuthLog({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M7.5 18.5c1.2-2 2.9-3 4.5-3s3.3 1 4.5 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M2 22h20M10 6h4M10 10h4M10 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPanelLeft({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const sidebarIcons = {
  review: <IconClipboard />,
  grant: <IconUserPlus />,
  employees: <IconUsers />,
  admins: <IconShield />,
  audit: <IconHistory />,
  authLog: <IconAuthLog />,
  plants: <IconBuilding />,
};

function isAuditSectionTab(tab: DashboardTab): boolean {
  return tab === "audit" || tab === "authLog";
}

function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

type AuditLogNavProps = {
  options: AuditMenuOption[];
  activeTab: DashboardTab;
  collapsed: boolean;
  onNavigate: (tab: DashboardTab) => void;
  onCloseMobile: () => void;
};

/**
 * Single Audit Log control:
 * - Desktop: click → flyout to the RIGHT via portal (above dashboard UI)
 * - Mobile: click → accordion dropdown inside the sidebar
 * - Collapsed desktop: icon-only trigger; flyout still opens to the right
 */
function AuditLogNav({
  options,
  activeTab,
  collapsed,
  onNavigate,
  onCloseMobile,
}: AuditLogNavProps) {
  const [open, setOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const parentActive = isAuditSectionTab(activeTab);

  const updateFlyoutPosition = () => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const gap = 12;
    const estimatedHeight = 96;
    const maxTop = window.innerHeight - estimatedHeight / 2 - 12;
    const minTop = estimatedHeight / 2 + 12;
    const top = Math.min(maxTop, Math.max(minTop, rect.top + rect.height / 2));
    const left = Math.min(window.innerWidth - 220, rect.right + gap);
    setFlyoutPos({ top, left });
  };

  useEffect(() => {
    if (!open) {
      setFlyoutPos(null);
      return;
    }
    updateFlyoutPosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      const inTrigger = rootRef.current?.contains(target);
      const inFlyout = flyoutRef.current?.contains(target);
      if (!inTrigger && !inFlyout) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onReposition = () => updateFlyoutPosition();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (
      parentActive &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setOpen(true);
    }
  }, [parentActive]);

  const choose = (tab: "audit" | "authLog") => {
    onNavigate(tab);
    setOpen(false);
    onCloseMobile();
  };

  const desktopFlyout =
    open && flyoutPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={flyoutRef}
            id={`${panelId}-desktop`}
            role="menu"
            aria-label="Audit log types"
            className="pointer-events-auto fixed z-[200] hidden -translate-y-1/2 lg:block"
            style={{ top: flyoutPos.top, left: flyoutPos.left }}
          >
            <span
              className="absolute top-1/2 -left-1.5 z-0 h-3 w-3 -translate-y-1/2 rotate-45 bg-[#0B2F1C]"
              aria-hidden
            />
            <div className="relative z-10 min-w-[12.75rem] max-w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-[#0B2F1C] py-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.35)] ring-1 ring-white/10">
              <ul className="flex flex-col">
                {options.map((option) => {
                  const selected = activeTab === option.id;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => choose(option.id)}
                        className={clsx(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition",
                          selected
                            ? "bg-white/12 text-white"
                            : "text-white/90 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#A8C5B6]"
                          aria-hidden
                        />
                        {option.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        aria-label="Audit Log"
        title={collapsed ? "Audit Log" : undefined}
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          "flex w-full items-center rounded-xl text-left text-sm font-medium transition",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
          parentActive || open
            ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(0,132,61,0.15)]"
            : "text-text-muted hover:bg-white/60 hover:text-text",
        )}
      >
        <span
          className={clsx(
            "shrink-0",
            parentActive || open ? "text-primary" : "text-text-muted",
          )}
        >
          {sidebarIcons.audit}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate">Audit Log</span>
            <span
              className={clsx(
                "shrink-0 text-current transition-transform duration-200 lg:rotate-0",
                open && "max-lg:rotate-90",
              )}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </>
        ) : null}
      </button>

      {open && !collapsed ? (
        <div
          id={panelId}
          className="mt-1 overflow-hidden rounded-xl border border-border/70 bg-white/95 lg:hidden"
          role="menu"
          aria-label="Audit log types"
        >
          <ul className="flex flex-col py-1">
            {options.map((option) => {
              const selected = activeTab === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => choose(option.id)}
                    className={clsx(
                      "flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm font-semibold transition",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-text hover:bg-background",
                    )}
                  >
                    <span
                      className={clsx(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        selected ? "bg-primary" : "bg-text-muted/50",
                      )}
                      aria-hidden
                    />
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {desktopFlyout}
    </div>
  );
}

function NavButton({
  label,
  icon,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex w-full items-center rounded-xl text-left text-sm font-medium transition",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
        active
          ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(0,132,61,0.15)]"
          : "text-text-muted hover:bg-white/60 hover:text-text",
      )}
    >
      <span
        className={clsx("shrink-0", active ? "text-primary" : "text-text-muted")}
      >
        {icon}
      </span>
      {!collapsed ? <span className="min-w-0 truncate">{label}</span> : null}
    </button>
  );
}

/**
 * Desktop: collapsible icon rail (persist preference).
 * Mobile: full drawer (unchanged).
 */
export function DashboardSidebar({
  items,
  auditMenuOptions = [],
  activeTab,
  employeeId,
  roleLabel,
  plantLabel,
  mobileOpen,
  onNavigate,
  onCloseMobile,
  onSignOut,
}: DashboardSidebarProps) {
  const showAuditMenu = auditMenuOptions.length > 0;
  const mainItems = items.filter((item) => item.id !== "plants");
  const plantItem = items.find((item) => item.id === "plants");
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setDesktopCollapsed(readCollapsedPreference());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const toggleDesktopCollapsed = () => {
    setDesktopCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPreference(next);
      return next;
    });
  };

  // Icon rail only on desktop; mobile drawer always shows full labels.
  const collapsed = desktopCollapsed && isDesktop;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-text/30 backdrop-blur-[2px] lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={clsx(
          "fixed inset-y-3 left-3 z-50 flex flex-col rounded-[1.5rem] glass-panel transition-[width,transform] duration-300 ease-out lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-2rem)] lg:shrink-0 lg:translate-x-0",
          // Mobile always full width drawer
          "w-[15.5rem]",
          // Desktop collapse → icon rail
          collapsed ? "lg:w-[4.75rem]" : "lg:w-[15.5rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        )}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div
          className={clsx(
            "border-b border-white/50",
            collapsed ? "px-2 py-3 lg:px-2" : "px-4 py-4",
          )}
        >
          <div
            className={clsx(
              "flex gap-2",
              collapsed
                ? "flex-col items-center lg:items-center"
                : "items-start justify-between",
            )}
          >
            <div className="min-w-0 flex-1">
              {/* Mobile drawer — full wordmark, width-capped */}
              <div className="lg:hidden">
                <BrandLogo size="md" align="start" />
                <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
                  Admin Portal
                </p>
              </div>

              {/* Desktop expanded wordmark / collapsed chain mark */}
              {!collapsed ? (
                <div className="hidden min-w-0 lg:block">
                  <BrandLogo size="md" align="start" />
                  <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
                    Admin Portal
                  </p>
                </div>
              ) : (
                <div className="hidden lg:flex lg:justify-center">
                  <BrandLogo size="sm" variant="mark" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleDesktopCollapsed}
              className={clsx(
                "hidden shrink-0 place-items-center rounded-lg border border-border/80 bg-white/70 text-text transition hover:bg-white lg:grid",
                "h-9 w-9",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span
                className={clsx(
                  "transition-transform duration-300",
                  collapsed && "rotate-180",
                )}
              >
                <IconPanelLeft />
              </span>
            </button>
          </div>
        </div>

        <nav
          className={clsx(
            "flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-4",
            collapsed ? "px-2" : "px-3",
          )}
          aria-label="Admin sections"
        >
          {mainItems.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={activeTab === item.id}
              collapsed={collapsed}
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
            />
          ))}

          {showAuditMenu ? (
            <AuditLogNav
              options={auditMenuOptions}
              activeTab={activeTab}
              collapsed={collapsed}
              onNavigate={onNavigate}
              onCloseMobile={onCloseMobile}
            />
          ) : null}

          {plantItem ? (
            <NavButton
              label={plantItem.label}
              icon={plantItem.icon}
              active={activeTab === plantItem.id}
              collapsed={collapsed}
              onClick={() => {
                onNavigate(plantItem.id);
                onCloseMobile();
              }}
            />
          ) : null}
        </nav>

        <div
          className={clsx(
            "border-t border-white/50",
            collapsed ? "px-2 py-3" : "px-4 py-4",
          )}
        >
          {!collapsed ? (
            <div className="rounded-xl bg-white/50 px-3 py-3">
              <p className="truncate text-sm font-semibold text-text">
                {employeeId}
              </p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{roleLabel}</p>
              <p className="mt-1 truncate text-xs text-text-muted">{plantLabel}</p>
            </div>
          ) : (
            <div
              className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary"
              title={`${employeeId} · ${roleLabel}`}
            >
              {employeeId.slice(0, 2).toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={onSignOut}
            title={collapsed ? "Sign out" : undefined}
            aria-label="Sign out"
            className={clsx(
              "mt-3 w-full rounded-xl border border-border/80 bg-white/70 text-sm font-medium text-text transition hover:bg-white",
              collapsed
                ? "grid h-10 place-items-center px-0"
                : "px-3 py-2",
            )}
          >
            {collapsed ? <IconLogout /> : "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
