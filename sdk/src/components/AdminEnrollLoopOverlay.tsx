import { useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import type { KioskAdminSession } from "../types/kioskAdmin.types";
import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

export interface AdminEnrollSubmitPayload {
  employeeId: string;
  fullName: string;
}

export interface AdminEnrollLoopOverlayProps {
  open: boolean;
  session: KioskAdminSession;
  busy?: boolean;
  errorMessage?: string | null;
  /** Shown after a successful enroll — cleared on next attempt. */
  lastEnrolledEmployeeId?: string | null;
  onEnrollNext: (payload: AdminEnrollSubmitPayload) => void;
  onEndSession: () => void;
}

function formatPlantScope(session: KioskAdminSession): string {
  if (session.plantCode && session.plantName) {
    return `${session.plantName} (${session.plantCode})`;
  }
  return session.plantName ?? session.plantCode ?? session.plantId ?? "All plants";
}

/**
 * STATE 5 — Path B batch enrollment loop.
 * Fresh face capture per worker; never reuses failed-auth JPEG.
 */
export function AdminEnrollLoopOverlay({
  open,
  session,
  busy = false,
  errorMessage = null,
  lastEnrolledEmployeeId = null,
  onEnrollNext,
  onEndSession,
}: AdminEnrollLoopOverlayProps): ReactElement | null {
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const canEnroll =
    targetEmployeeId.trim().length > 0 &&
    fullName.trim().length > 0 &&
    !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canEnroll) {
      return;
    }
    onEnrollNext({
      employeeId: targetEmployeeId.trim(),
      fullName: fullName.trim(),
    });
  };

  const inputStyle = (field: string): CSSProperties => ({
    ...styles.input,
    ...(focusedField === field ? styles.inputFocused : {}),
    ...(busy ? styles.inputDisabled : {}),
  });

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-enroll-loop-title"
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <p style={styles.eyebrow}>Face Authentication</p>
            <h2 id="admin-enroll-loop-title" style={styles.title}>
              Enroll workers
            </h2>
          </div>
        </header>

        <p style={styles.subtitle}>
          Enter the worker Employee ID and full name, then capture a fresh face
          photo. Each enrollment is active immediately under your plant scope.
        </p>

        <div style={styles.contextCard} aria-label="Admin session context">
          <div style={styles.contextRow}>
            <span style={styles.contextLabel}>Admin</span>
            <span style={styles.contextValue}>{session.employeeId}</span>
          </div>
          <div style={styles.contextRow}>
            <span style={styles.contextLabel}>Plant</span>
            <span style={styles.contextValue}>{formatPlantScope(session)}</span>
          </div>
        </div>

        {lastEnrolledEmployeeId ? (
          <p style={styles.successBanner} role="status">
            Enrolled <strong>{lastEnrolledEmployeeId}</strong> — ready for face
            login.
          </p>
        ) : null}

        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-enroll-target-id">
              Worker Employee ID
            </label>
            <input
              id="face-auth-enroll-target-id"
              type="text"
              value={targetEmployeeId}
              disabled={busy}
              style={inputStyle("employeeId")}
              onFocus={() => setFocusedField("employeeId")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setTargetEmployeeId(event.target.value)}
              placeholder="Employee ID"
              autoComplete="off"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-enroll-full-name">
              Full name
            </label>
            <input
              id="face-auth-enroll-full-name"
              type="text"
              value={fullName}
              disabled={busy}
              style={inputStyle("fullName")}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full name"
              autoComplete="name"
              required
            />
          </div>

          {errorMessage ? (
            <div style={styles.errorAlert} role="alert">
              <span style={styles.errorIcon} aria-hidden>
                !
              </span>
              <p style={styles.errorText}>{errorMessage}</p>
            </div>
          ) : null}

          <div style={styles.actions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={onEndSession}
              disabled={busy}
            >
              End session
            </button>
            <button
              type="submit"
              style={{
                ...styles.primaryButton,
                ...(!canEnroll ? styles.primaryButtonDisabled : {}),
              }}
              disabled={!canEnroll}
            >
              {busy ? (
                <span style={styles.submitContent}>
                  <span style={styles.spinner} aria-hidden />
                  Capturing…
                </span>
              ) : (
                "Capture & enroll"
              )}
            </button>
          </div>
        </form>

        <p style={styles.footer}>
          Do not use Authenticate during this session — enroll each worker with a
          new capture. End session when finished.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: overlayShellStyles.root,
  panel: {
    ...overlayShellStyles.panel,
    width: "min(480px, 100%)",
    padding: "24px 24px 20px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    minWidth: 0,
  },
  eyebrow: overlayShellStyles.eyebrow,
  title: overlayShellStyles.title,
  subtitle: overlayShellStyles.subtitle,
  contextCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${BRAND.border}`,
    background: BRAND.background,
  },
  contextRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: BRAND_DERIVED.textMuted,
  },
  contextValue: {
    fontSize: 15,
    fontWeight: 600,
    color: BRAND.text,
  },
  successBanner: {
    margin: 0,
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${BRAND.primary}`,
    background: BRAND_DERIVED.primaryTint,
    fontSize: 14,
    lineHeight: 1.45,
    color: BRAND.text,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 4,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: BRAND.text,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    borderRadius: 8,
    border: `1px solid ${BRAND.border}`,
    background: BRAND_DERIVED.panel,
    color: BRAND.text,
    padding: "11px 14px",
    fontSize: 15,
    outline: "none",
  },
  inputFocused: {
    borderColor: BRAND.primary,
    boxShadow: `0 0 0 3px ${BRAND_DERIVED.focusRing}`,
  },
  inputDisabled: {
    background: BRAND.background,
    color: BRAND_DERIVED.textMuted,
  },
  errorAlert: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fef2f2",
  },
  errorIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    borderRadius: "999px",
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
  },
  errorText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: "#991b1b",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 8,
    border: `1px solid ${BRAND.border}`,
    background: BRAND_DERIVED.panel,
    color: BRAND.text,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryButton: {
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 8,
    border: "none",
    background: BRAND.primary,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "auto",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  submitContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: "999px",
    border: "2px solid rgba(255,255, 255, 0.35)",
    borderTopColor: "#ffffff",
    display: "inline-block",
    animation: "far-register-spin 0.8s linear infinite",
  },
  footer: overlayShellStyles.footer,
};
