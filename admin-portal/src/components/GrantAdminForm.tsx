import { useState, type FormEvent } from "react";

import type { AdminGrantPayload, AdminGrantPreview } from "../api/adminApi";
import { ButtonSpinner, LoadingButton } from "./ui/LoadingButton";

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
    <div className="max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-text">Grant plant admin</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
          Give portal access to an enrolled worker. Their plant comes from the
          employee record and cannot be changed here.
        </p>
      </div>

      {statusMessage ? (
        <p
          className="mt-4 rounded-xl border border-primary/30 bg-primary/15 px-4 py-3 text-sm text-primary"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-400"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Employee ID
          <input
            className="h-11 rounded-xl border border-border/80 bg-surface px-3.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60"
            value={employeeId}
            onChange={(event) => handleEmployeeChange(event.target.value)}
            onBlur={handleEmployeeBlur}
            placeholder="e.g. EMP003"
            autoComplete="off"
            disabled={busy}
            required
          />
          <span className="text-xs font-normal text-text-muted">
            Leave the field to look up the worker and their plant.
          </span>
        </label>

        {previewLoading ? (
          <p className="flex items-center gap-2 text-sm text-text-muted" aria-live="polite">
            <ButtonSpinner tone="dark" className="h-3.5 w-3.5" />
            Looking up employee…
          </p>
        ) : null}

        {previewError ? (
          <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-400">
            {previewError}
          </p>
        ) : null}

        {previewMatches && !previewError ? (
          <div className="rounded-xl border border-border/80 bg-background/80 px-4 py-3 text-sm">
            <p className="font-mono font-medium text-text">{preview.employeeId}</p>
            <p className="mt-1 text-text-muted">
              Plant: {preview.plantName} ({preview.plantCode})
            </p>
            {!preview.grantEligible ? (
              <p className="mt-2 text-sm text-primary">
                Already an active admin
                {preview.existingAdminRole
                  ? ` (${preview.existingAdminRole.replace("_", " ")})`
                  : ""}
                . Choose another worker or revoke existing admin access first.
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Portal password
          <input
            className="h-11 rounded-xl border border-border/80 bg-surface px-3.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy || (previewMatches && !preview.grantEligible)}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Confirm password
          <input
            className="h-11 rounded-xl border border-border/80 bg-surface px-3.5 text-base text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy || (previewMatches && !preview.grantEligible)}
            required
          />
          {confirmPassword && password !== confirmPassword ? (
            <span className="text-xs font-normal text-red-400">
              Passwords do not match.
            </span>
          ) : null}
        </label>

        <LoadingButton
          type="submit"
          loading={busy}
          loadingLabel="Granting…"
          disabled={!canSubmit && !busy}
          className="mt-1 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Grant PLANT_ADMIN
        </LoadingButton>
      </form>
    </div>
  );
}
