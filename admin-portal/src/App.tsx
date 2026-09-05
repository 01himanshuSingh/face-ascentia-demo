/**
 * Admin Portal root — thin orchestrator only.
 *
 * Layers:
 *   adminApi.ts          HTTP + sessionStorage transport
 *   usePlantWorkspace    SUPER plant lens (sessionStorage) / PLANT_ADMIN fixed
 *   useRegistrationQueue pending for active plant workspace
 *   useGrantAdmin        PLANT_ADMIN provisioning
 *   usePlantCatalog      plant create / update / soft-deactivate (PLANTS_MANAGE)
 *   usePlantAdmins       SUPER plant-admin roster + ungrant
 *   usePlantEmployees    ACTIVE enrolled workers + soft revoke
 *   useAuditLog          plant-scoped compliance timeline (AUDIT_VIEW)
 *
 * Security: plant scoping stays on the backend. This file passes
 * workspacePlantId to APIs; it does not filter rows in the client.
 */

import { useMemo, useState } from "react";

import {
  canCreatePlants,
  canDeactivatePlants,
  canGrantPlantAdmin,
  canManagePlants,
  canRevokePlantAdmins,
  canViewAudit,
  canViewAuditEnrollmentImage,
  canRevokeEmployees,
  type AdminSession,
} from "./api/adminApi";
import { PlantAdminsPanel } from "./components/admins/PlantAdminsPanel";
import { AuditLogPanel } from "./components/audit/AuditLogPanel";
import { EmployeesPanel } from "./components/employees/EmployeesPanel";
import { GrantAdminForm } from "./components/GrantAdminForm";
import {
  DashboardSidebar,
  sidebarIcons,
  type DashboardTab,
  type SidebarNavItem,
} from "./components/layout/DashboardSidebar";
import { LoginForm } from "./components/LoginForm";
import { PlantWorkspaceSelector } from "./components/PlantWorkspaceSelector";
import { PlantCatalogPanel } from "./components/plants/PlantCatalogPanel";
import { RequestDetails } from "./components/RequestDetails";
import { RequestTable } from "./components/RequestTable";
import { useAdminSession } from "./hooks/useAdminSession";
import { useAuditLog } from "./hooks/useAuditLog";
import { useGrantAdmin } from "./hooks/useGrantAdmin";
import { usePlantAdmins } from "./hooks/usePlantAdmins";
import { usePlantCatalog } from "./hooks/usePlantCatalog";
import { usePlantEmployees } from "./hooks/usePlantEmployees";
import { usePlantWorkspace } from "./hooks/usePlantWorkspace";
import { useRegistrationQueue } from "./hooks/useRegistrationQueue";

function scopeLabel(
  session: AdminSession,
  workspaceLabel: string | null,
): string {
  if (session.role === "SUPER_ADMIN") {
    return workspaceLabel ?? "Select a plant";
  }
  return workspaceLabel ?? "Plant-scoped";
}

function tabTitle(tab: DashboardTab): string {
  if (tab === "grant") {
    return "Grant plant admin";
  }
  if (tab === "plants") {
    return "Plant catalog";
  }
  if (tab === "admins") {
    return "Plant admins";
  }
  if (tab === "audit") {
    return "Audit log";
  }
  if (tab === "employees") {
    return "Employees";
  }
  return "Registration review";
}

function tabSubtitle(tab: DashboardTab): string {
  if (tab === "grant") {
    return "Grant portal access to an enrolled worker.";
  }
  if (tab === "plants") {
    return "Create and manage plant workspaces.";
  }
  if (tab === "admins") {
    return "Review plant admins and soft-ungrant when needed.";
  }
  if (tab === "audit") {
    return "Plant actions for the last 7 days. Open a row for details.";
  }
  if (tab === "employees") {
    return "Active enrolled workers and left / revoked history.";
  }
  return "Compare the capture against offline HR, then approve or reject.";
}

export function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("review");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const {
    session,
    view,
    loginBusy,
    loginError,
    sessionNotice,
    signIn,
    signOut,
    handleAuthFailure,
  } = useAdminSession();

  const workspace = usePlantWorkspace({
    session,
    enabled: view === "dashboard" && Boolean(session),
    onAuthFailure: handleAuthFailure,
  });

  const showGrantTab = session ? canGrantPlantAdmin(session) : false;
  const showPlantsTab = session ? canManagePlants(session) : false;
  const showAdminsTab = session ? canRevokePlantAdmins(session) : false;
  const showAuditTab = session ? canViewAudit(session) : false;
  const showEmployeesTab = session ? canRevokeEmployees(session) : false;

  const reviewEnabled = view === "dashboard" && activeTab === "review";
  const grantEnabled =
    view === "dashboard" && activeTab === "grant" && showGrantTab;
  const plantsEnabled =
    view === "dashboard" && activeTab === "plants" && showPlantsTab;
  const adminsEnabled =
    view === "dashboard" && activeTab === "admins" && showAdminsTab;
  const auditEnabled =
    view === "dashboard" && activeTab === "audit" && showAuditTab;
  const employeesEnabled =
    view === "dashboard" && activeTab === "employees" && showEmployeesTab;

  const queue = useRegistrationQueue({
    session,
    workspacePlantId: workspace.workspacePlantId,
    enabled: reviewEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const grant = useGrantAdmin({
    session,
    enabled: grantEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const catalog = usePlantCatalog({
    session,
    enabled: plantsEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const plantAdmins = usePlantAdmins({
    session,
    workspacePlantId: workspace.workspacePlantId,
    enabled: adminsEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const audit = useAuditLog({
    session,
    workspacePlantId: workspace.workspacePlantId,
    enabled: auditEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const plantEmployees = usePlantEmployees({
    session,
    workspacePlantId: workspace.workspacePlantId,
    enabled: employeesEnabled,
    onAuthFailure: handleAuthFailure,
  });

  const workspaceLabel = workspace.selectedPlant
    ? `${workspace.selectedPlant.plantName} (${workspace.selectedPlant.plantCode})`
    : null;

  const showWorkspaceSelector =
    workspace.isSuperAdmin &&
    (activeTab === "review" ||
      activeTab === "grant" ||
      activeTab === "admins" ||
      activeTab === "audit" ||
      activeTab === "employees");

  const navItems = useMemo(() => {
    const items: SidebarNavItem[] = [
      {
        id: "review",
        label: "Registration Review",
        icon: sidebarIcons.review,
      },
    ];
    if (showGrantTab) {
      items.push({
        id: "grant",
        label: "Grant Admin",
        icon: sidebarIcons.grant,
      });
    }
    if (showEmployeesTab) {
      items.push({
        id: "employees",
        label: "Employees",
        icon: sidebarIcons.employees,
      });
    }
    if (showAdminsTab) {
      items.push({
        id: "admins",
        label: "Plant Admins",
        icon: sidebarIcons.admins,
      });
    }
    if (showAuditTab) {
      items.push({
        id: "audit",
        label: "Audit Log",
        icon: sidebarIcons.audit,
      });
    }
    if (showPlantsTab) {
      items.push({
        id: "plants",
        label: "Plants",
        icon: sidebarIcons.plants,
      });
    }
    return items;
  }, [
    showAdminsTab,
    showAuditTab,
    showEmployeesTab,
    showGrantTab,
    showPlantsTab,
  ]);

  const handleNavigate = (tab: DashboardTab) => {
    setActiveTab(tab);
    if (tab === "grant") {
      grant.clearStatus();
    }
    if (tab === "plants") {
      catalog.clearStatus();
    }
  };

  if (view === "bootstrap") {
    return (
      <main className="grid min-h-screen place-items-center dashboard-ambient">
        <p className="text-sm text-text-muted">Loading admin session…</p>
      </main>
    );
  }

  if (view === "login") {
    return (
      <LoginForm
        busy={loginBusy}
        error={loginError}
        notice={sessionNotice}
        onSubmit={signIn}
      />
    );
  }

  if (!session) {
    return null;
  }

  const reviewNeedsPlant = !workspace.workspacePlantId;

  return (
    <div className="dashboard-ambient min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-3 lg:gap-5 lg:p-4">
        <DashboardSidebar
          items={navItems}
          activeTab={activeTab}
          employeeId={session.employeeId}
          roleLabel={session.role.replace("_", " ")}
          plantLabel={scopeLabel(session, workspaceLabel)}
          mobileOpen={mobileNavOpen}
          onNavigate={handleNavigate}
          onCloseMobile={() => setMobileNavOpen(false)}
          onSignOut={() => signOut()}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="rounded-[1.35rem] glass-panel px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/80 bg-white/70 text-text lg:hidden"
                  aria-label="Open navigation"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 7h16M4 12h16M4 17h16"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">
                    {tabTitle(activeTab)}
                  </h1>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
                    {tabSubtitle(activeTab)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {showWorkspaceSelector ? (
                  <PlantWorkspaceSelector
                    plants={workspace.plants}
                    selectedPlantId={workspace.workspacePlantId}
                    loading={workspace.plantsLoading}
                    onChange={workspace.setSelectedPlantId}
                  />
                ) : null}
                {activeTab === "review" ? (
                  <button
                    type="button"
                    onClick={() => void queue.refresh()}
                    disabled={queue.loading || queue.decisionBusy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-white/80 px-3.5 text-sm font-medium text-text transition hover:bg-white disabled:opacity-60"
                  >
                    Refresh
                  </button>
                ) : null}
                {activeTab === "plants" ? (
                  <button
                    type="button"
                    onClick={() => void catalog.refresh()}
                    disabled={catalog.loading || catalog.busy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-white/80 px-3.5 text-sm font-medium text-text transition hover:bg-white disabled:opacity-60"
                  >
                    Refresh
                  </button>
                ) : null}
                {activeTab === "admins" ? (
                  <button
                    type="button"
                    onClick={() => void plantAdmins.refresh()}
                    disabled={plantAdmins.loading || plantAdmins.busy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-white/80 px-3.5 text-sm font-medium text-text transition hover:bg-white disabled:opacity-60"
                  >
                    Refresh
                  </button>
                ) : null}
                {activeTab === "audit" ? (
                  <button
                    type="button"
                    onClick={() => void audit.refresh()}
                    disabled={audit.loading}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-white/80 px-3.5 text-sm font-medium text-text transition hover:bg-white disabled:opacity-60"
                  >
                    Refresh
                  </button>
                ) : null}
                {activeTab === "employees" ? (
                  <button
                    type="button"
                    onClick={() => void plantEmployees.refresh()}
                    disabled={plantEmployees.loading || plantEmployees.busy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-white/80 px-3.5 text-sm font-medium text-text transition hover:bg-white disabled:opacity-60"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-w-0 flex-1 pb-2">
            {activeTab === "review" ? (
              <main className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.2rem] glass-panel-soft px-4 py-3.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Pending reviews
                    </p>
                    <p className="mt-1.5 text-2xl font-semibold text-text">
                      {reviewNeedsPlant ? "—" : queue.total}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] glass-panel-soft px-4 py-3.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Selected request
                    </p>
                    <p className="mt-1.5 truncate text-lg font-semibold text-text">
                      {queue.selected?.employeeId ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] glass-panel-soft px-4 py-3.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Current plant
                    </p>
                    <p className="mt-1.5 truncate text-lg font-semibold text-text">
                      {workspaceLabel ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                  <section className="min-w-0">
                    <RequestTable
                      items={queue.items}
                      selectedId={queue.selectedId}
                      loading={queue.loading}
                      onSelect={queue.setSelectedId}
                      needsPlant={reviewNeedsPlant}
                      workspaceLabel={workspaceLabel}
                      total={queue.total}
                      page={queue.page}
                      pageSize={queue.pageSize}
                      totalPages={queue.totalPages}
                      onPageChange={queue.goToPage}
                    />
                  </section>
                  <section className="min-w-0">
                    <RequestDetails
                      item={queue.selected}
                      imageUrl={queue.imageUrl}
                      imageLoading={queue.imageLoading}
                      busy={queue.decisionBusy}
                      reviewerEmployeeId={session.employeeId}
                      onApprove={queue.approve}
                      onReject={queue.reject}
                    />
                  </section>
                </div>
              </main>
            ) : null}

            {activeTab === "grant" && showGrantTab ? (
              <main className="rounded-[1.35rem] glass-panel p-5">
                <GrantAdminForm
                  preview={grant.preview}
                  previewLoading={grant.previewLoading}
                  previewError={grant.previewError}
                  busy={grant.busy}
                  errorMessage={null}
                  statusMessage={null}
                  onLookupEmployee={grant.lookupEmployee}
                  onClearPreview={grant.clearPreview}
                  onSubmit={grant.submitGrant}
                />
              </main>
            ) : null}

            {activeTab === "employees" && showEmployeesTab ? (
              <main className="rounded-[1.35rem] glass-panel p-5">
                <EmployeesPanel
                  employees={plantEmployees.employees}
                  total={plantEmployees.total}
                  loading={plantEmployees.loading}
                  busy={plantEmployees.busy}
                  rosterStatus={plantEmployees.rosterStatus}
                  searchInput={plantEmployees.searchInput}
                  needsPlant={plantEmployees.needsPlant}
                  workspaceLabel={workspaceLabel}
                  page={plantEmployees.page}
                  pageSize={plantEmployees.pageSize}
                  totalPages={plantEmployees.totalPages}
                  onRosterStatusChange={plantEmployees.setRosterStatus}
                  onSearchChange={plantEmployees.setSearchInput}
                  onPageChange={plantEmployees.goToPage}
                  onRevoke={plantEmployees.revoke}
                />
              </main>
            ) : null}

            {activeTab === "admins" && showAdminsTab ? (
              <main className="rounded-[1.35rem] glass-panel p-5">
                <PlantAdminsPanel
                  admins={plantAdmins.admins}
                  total={plantAdmins.total}
                  loading={plantAdmins.loading}
                  busy={plantAdmins.busy}
                  searchInput={plantAdmins.searchInput}
                  needsPlant={plantAdmins.needsPlant}
                  workspaceLabel={workspaceLabel}
                  page={plantAdmins.page}
                  pageSize={plantAdmins.pageSize}
                  totalPages={plantAdmins.totalPages}
                  onSearchChange={plantAdmins.setSearchInput}
                  onPageChange={plantAdmins.goToPage}
                  onRevoke={plantAdmins.revoke}
                />
              </main>
            ) : null}

            {activeTab === "audit" && showAuditTab ? (
              <main className="rounded-[1.35rem] glass-panel p-5">
                <AuditLogPanel
                  items={audit.items}
                  loading={audit.loading}
                  total={audit.total}
                  page={audit.page}
                  pageSize={audit.pageSize}
                  totalPages={audit.totalPages}
                  category={audit.category}
                  searchInput={audit.searchInput}
                  needsPlant={audit.needsPlant}
                  workspaceLabel={workspaceLabel}
                  token={session.adminSessionToken}
                  allowFace={canViewAuditEnrollmentImage(session)}
                  onCategoryChange={audit.setCategory}
                  onSearchChange={audit.setSearchInput}
                  onPageChange={audit.goToPage}
                />
              </main>
            ) : null}

            {activeTab === "plants" && showPlantsTab ? (
              <main className="rounded-[1.35rem] glass-panel p-5">
                <PlantCatalogPanel
                  plants={catalog.plants}
                  loading={catalog.loading}
                  busy={catalog.busy}
                  error={null}
                  statusMessage={null}
                  allowCreate={canCreatePlants(session)}
                  allowDeactivate={canDeactivatePlants(session)}
                  total={catalog.total}
                  page={catalog.page}
                  pageSize={catalog.pageSize}
                  totalPages={catalog.totalPages}
                  onPageChange={catalog.goToPage}
                  onCreate={catalog.create}
                  onUpdate={catalog.update}
                  onSetActive={catalog.setActive}
                />
              </main>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
