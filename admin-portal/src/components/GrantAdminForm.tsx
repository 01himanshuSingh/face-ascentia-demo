import { useState, type FormEvent } from "react";

import type { AdminGrantPayload, AdminGrantPreview } from "../api/adminApi";

export type GrantAdminFormProps = {
  preview: AdminGrantPreview | null;
  previewLoading: boolean;
  previewError: string | null;
  busy: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onLookupEmployee: (employeeId: string) => void;
  onClearPreview: () => void;
  onSubmit: (payload: AdminGrantPayload) => Promise<void>;
};

export function GrantAdminForm({
  preview,
  previewLoading,
  previewError,
  busy,
  errorMessage,
  statusMessage,
  onLookupEmployee,
  onClearPreview,
  onSubmit,
}: GrantAdminFormProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const trimmedEmployeeId = employeeId.trim();
  const previewMatches =
    preview != null && preview.employeeId === trimmedEmployeeId;

  const canSubmit =
    trimmedEmployeeId.length > 0 &&
    previewMatches &&
    preview.grantEligible &&
    password.length > 0 &&
    password === confirmPassword &&
    !busy &&
    !previewLoading;

  const handleEmployeeChange = (value: string) => {
    setEmployeeId(value);
    onClearPreview();
  };

  const handleEmployeeBlur = () => {
    if (trimmedEmployeeId) {
      onLookupEmployee(trimmedEmployeeId);
    } else {
      onClearPreview();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    void onSubmit({
      employeeId: trimmedEmployeeId,
      password,
    }).then(() => {
      setPassword("");
      setConfirmPassword("");
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm shadow-text/5">
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold text-text">Grant plant admin</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Assign <strong className="font-medium text-text">PLANT_ADMIN</strong>{" "}
          to an employee who is already enrolled as a worker. Plant workspace
          is taken from the employee record — it cannot be changed at grant time.
        </p>
      </div>

      {statusMessage ? (
        <p
          className="mt-4 rounded-lg border border-primary/30 bg-brand-50 px-4 py-3 text-sm text-brand-800"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex max-w-lg flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Employee ID
          <input
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
            value={employeeId}
            onChange={(event) => handleEmployeeChange(event.target.value)}
            onBlur={handleEmployeeBlur}
            placeholder="e.g. EMP003"
            autoComplete="off"
            disabled={busy}
            required
          />
          <span className="text-xs font-normal text-text-muted">
            Tab out after entering ID to verify the worker and resolve their
            plant.
          </span>
        </label>

        {previewLoading ? (
          <p className="text-sm text-text-muted">Looking up employee…</p>
        ) : null}

        {previewError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {previewError}
          </p>
        ) : null}

        {previewMatches && !previewError ? (
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
            <p className="font-medium text-text">{preview.fullName}</p>
            <p className="mt-1 text-text-muted">
              Plant: {preview.plantName} ({preview.plantCode})
            </p>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Portal password
          <input
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Confirm password
          <input
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
            required
          />
          {confirmPassword && password !== confirmPassword ? (
            <span className="text-xs font-normal text-red-600">
              Passwords do not match.
            </span>
          ) : null}
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#006b31] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Granting…" : "Grant PLANT_ADMIN"}
        </button>
      </form>
    </div>
  );
}
