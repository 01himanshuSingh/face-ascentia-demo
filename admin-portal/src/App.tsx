/**
 * Admin Portal root — thin orchestrator only.
 *
 * Layers:
 *   adminApi.ts          HTTP + sessionStorage transport
 *   usePlantWorkspace    SUPER plant lens (sessionStorage) / PLANT_ADMIN fixed
 *   useRegistrationQueue pending for active plant workspace
 *   useGrantAdmin        PLANT_ADMIN provisioning
 *   usePlantCatalog      plant create / update / soft-deactivate (PLANTS_MANAGE)
 *
 * Security: plant scoping and PLANTS_MANAGE stay on the backend. This file
 * passes workspacePlantId to APIs; it does not filter queue rows in the client.
 */

import { useState } from "react";

import {
  canCreatePlants,
  canDeactivatePlants,
  canGrantPlantAdmin,
  canManagePlants,
  type AdminSession,
} from "./api/adminApi";
import { GrantAdminForm } from "./components/GrantAdminForm";
import { LoginForm } from "./components/LoginForm";
import { PlantWorkspaceSelector } from "./components/PlantWorkspaceSelector";
import { PlantCatalogPanel } from "./components/plants/PlantCatalogPanel";
import { RequestDetails } from "./components/RequestDetails";
import { RequestTable } from "./components/RequestTable";
import { useAdminSession } from "./hooks/useAdminSession";
import { useGrantAdmin } from "./hooks/useGrantAdmin";
import { usePlantCatalog } from "./hooks/usePlantCatalog";
import { usePlantWorkspace } from "./hooks/usePlantWorkspace";
import { useRegistrationQueue } from "./hooks/useRegistrationQueue";

type DashboardTab = "review" | "grant" | "plants";

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
  return "Registration review";
}

export function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("review");

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
  const showSectionNav = showGrantTab || showPlantsTab;

  const reviewEnabled = view === "dashboard" && activeTab === "review";
  const grantEnabled =
    view === "dashboard" && activeTab === "grant" && showGrantTab;
  const plantsEnabled =
    view === "dashboard" && activeTab === "plants" && showPlantsTab;

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

  const workspaceLabel = workspace.selectedPlant
    ? `${workspace.selectedPlant.plantName} (${workspace.selectedPlant.plantCode})`
    : null;

  if (view === "bootstrap") {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Face Auth · Admin
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">
              {tabTitle(activeTab)}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Signed in as{" "}
              <span className="font-medium text-text">{session.employeeId}</span>{" "}
              · {session.role.replace("_", " ")} ·{" "}
              {scopeLabel(session, workspaceLabel)}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {workspace.isSuperAdmin && activeTab === "review" ? (
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
                className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
              >
                Refresh
              </button>
            ) : null}
            {activeTab === "plants" ? (
              <button
                type="button"
                onClick={() => void catalog.refresh()}
                disabled={catalog.loading || catalog.busy}
                className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
              >
                Refresh
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background"
            >
              Sign out
            </button>
          </div>
        </div>

        {showSectionNav ? (
          <div className="mx-auto max-w-7xl px-4 pb-3 sm:px-6">
            <nav
              className="inline-flex rounded-lg border border-border bg-background p-1"
              aria-label="Admin sections"
            >
              <button
                type="button"
                onClick={() => setActiveTab("review")}
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
                  activeTab === "review"
                    ? "bg-white text-text shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Registration review
              </button>
              {showGrantTab ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("grant");
                    grant.clearStatus();
                  }}
                  className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
                    activeTab === "grant"
                      ? "bg-white text-text shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Grant admin
                </button>
              ) : null}
              {showPlantsTab ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("plants");
                    catalog.clearStatus();
                  }}
                  className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
                    activeTab === "plants"
                      ? "bg-white text-text shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Plants
                </button>
              ) : null}
            </nav>
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {activeTab === "review" ? (
          <main className="grid gap-5 py-5 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-text">
                    Pending registrations
                    {workspaceLabel ? (
                      <span className="ml-2 font-normal text-text-muted">
                        · {workspaceLabel}
                      </span>
                    ) : null}
                  </h2>
                  <span className="rounded-full bg-border/80 px-2.5 py-0.5 text-xs font-semibold text-text">
                    {queue.items.length}
                  </span>
                </div>
                <RequestTable
                  items={queue.items}
                  selectedId={queue.selectedId}
                  loading={queue.loading}
                  onSelect={queue.setSelectedId}
                />
              </section>

              <section className="min-w-0">
                <RequestDetails
                  item={queue.selected}
                  imageUrl={queue.imageUrl}
                  imageLoading={queue.imageLoading}
                  busy={queue.decisionBusy}
                  onApprove={queue.approve}
                  onReject={queue.reject}
                />
              </section>
            </main>
        ) : null}

        {activeTab === "grant" && showGrantTab ? (
          <main className="py-5">
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

        {activeTab === "plants" && showPlantsTab ? (
          <main className="py-5">
            <PlantCatalogPanel
              plants={catalog.plants}
              loading={catalog.loading}
              busy={catalog.busy}
              error={null}
              statusMessage={null}
              allowCreate={canCreatePlants(session)}
              allowDeactivate={canDeactivatePlants(session)}
              onCreate={catalog.create}
              onUpdate={catalog.update}
              onSetActive={catalog.setActive}
            />
          </main>
        ) : null}
      </div>
    </div>
  );
}
