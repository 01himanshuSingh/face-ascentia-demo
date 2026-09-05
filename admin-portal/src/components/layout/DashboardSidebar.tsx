import clsx from "clsx";
import type { ReactNode } from "react";

export type DashboardTab =
  | "review"
  | "grant"
  | "plants"
  | "admins"
  | "audit"
  | "employees";

export type SidebarNavItem = {
  id: DashboardTab;
  label: string;
  icon: ReactNode;
};

export type DashboardSidebarProps = {
  items: SidebarNavItem[];
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

export const sidebarIcons = {
  review: <IconClipboard />,
  grant: <IconUserPlus />,
  employees: <IconUsers />,
  admins: <IconShield />,
  audit: <IconHistory />,
  plants: <IconBuilding />,
};

export function DashboardSidebar({
  items,
  activeTab,
  employeeId,
  roleLabel,
  plantLabel,
  mobileOpen,
  onNavigate,
  onCloseMobile,
  onSignOut,
}: DashboardSidebarProps) {
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
          "fixed inset-y-3 left-3 z-50 flex w-[15.5rem] flex-col rounded-[1.5rem] glass-panel transition-transform duration-300 lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-2rem)] lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        )}
      >
        <div className="border-b border-white/50 px-5 py-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
            Shift Face
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-text">Admin</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Admin sections">
          {items.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                  active
                    ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(0,132,61,0.15)]"
                    : "text-text-muted hover:bg-white/60 hover:text-text",
                )}
              >
                <span className={clsx("shrink-0", active ? "text-primary" : "text-text-muted")}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/50 px-4 py-4">
          <div className="rounded-xl bg-white/50 px-3 py-3">
            <p className="truncate text-sm font-semibold text-text">{employeeId}</p>
            <p className="mt-0.5 truncate text-xs text-text-muted">{roleLabel}</p>
            <p className="mt-1 truncate text-xs text-text-muted">{plantLabel}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-3 w-full rounded-xl border border-border/80 bg-white/70 px-3 py-2 text-sm font-medium text-text transition hover:bg-white"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
