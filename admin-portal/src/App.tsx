/**
 * Admin Portal root — thin orchestrator only.
 *
 * Layers (adapt without rewriting this file):
 *   adminApi.ts          HTTP + sessionStorage transport
 *   TanStack Query       server state (pending queue, image, mutations)
 *   useAdminSession      login / logout / session expiry
 *   useRegistrationQueue query hooks for review actions
 *   components/*         presentational UI (swap styling, add grant screen later)
 *
 * Security: plant scoping and permissions stay on the backend.
 * This file never filters the queue by plantId.
 */

import type { AdminSession } from "./api/adminApi";
import { LoginForm } from "./components/LoginForm";
import { RequestDetails } from "./components/RequestDetails";
import { RequestTable } from "./components/RequestTable";
import { useAdminSession } from "./hooks/useAdminSession";
import { useRegistrationQueue } from "./hooks/useRegistrationQueue";

function scopeLabel(session: AdminSession): string {
  if (session.role === "SUPER_ADMIN") {
    return "All plants";
  }
  return session.plantId ? `Plant-scoped` : "Plant admin";
}

export function App() {
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

  const queue = useRegistrationQueue({
    session,
    enabled: view === "dashboard",
    onAuthFailure: handleAuthFailure,
  });

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
              Registration review
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Signed in as{" "}
              <span className="font-medium text-text">{session.employeeId}</span>{" "}
              · {session.role.replace("_", " ")} · {scopeLabel(session)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void queue.refresh()}
              disabled={queue.loading || queue.decisionBusy}
              className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition hover:bg-background"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {queue.statusMessage ? (
          <p className="mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {queue.statusMessage}
          </p>
        ) : null}
        {queue.error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {queue.error}
          </p>
        ) : null}

        <main className="grid gap-5 py-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text">
                Pending registrations
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
      </div>
    </div>
  );
}
