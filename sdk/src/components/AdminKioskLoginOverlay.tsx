import { useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

export interface AdminKioskLoginSubmitPayload {
  employeeId: string;
  password: string;
}

export interface AdminKioskLoginOverlayProps {
  open: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: AdminKioskLoginSubmitPayload) => void;
  onCancel?: () => void;
}

/**
 * STATE 4 — Path B admin operator login at kiosk.
 * Same credentials as Admin Portal (admin_roles password, not face).
 */
export function AdminKioskLoginOverlay({
  open,
  busy = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: AdminKioskLoginOverlayProps): ReactElement | null {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const canSubmit = employeeId.trim().length > 0 && password.length > 0 && !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      employeeId: employeeId.trim(),
      password,
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
      aria-labelledby="admin-kiosk-login-title"
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <p style={styles.eyebrow}>Face Authentication</p>
            <h2 id="admin-kiosk-login-title" style={styles.title}>
              Admin Kiosk Login
            </h2>
          </div>
          {onCancel ? (
            <button
              type="button"
              style={styles.iconButton}
              onClick={onCancel}
              disabled={busy}
              aria-label="Close admin login"
            >
              ×
            </button>
          ) : null}
        </header>

        <p style={styles.subtitle}>
          Sign in with your admin Employee ID and password to enroll workers on
          this kiosk. Enrollments are active immediately.
        </p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-admin-employee-id">
              Admin Employee ID
            </label>
            <input
              id="face-auth-admin-employee-id"
              type="text"
              autoComplete="username"
              value={employeeId}
              disabled={busy}
              style={inputStyle("employeeId")}
              onFocus={() => setFocusedField("employeeId")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setEmployeeId(event.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-admin-password">
              Password
            </label>
            <input
              id="face-auth-admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              style={inputStyle("password")}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setPassword(event.target.value)}
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
            {onCancel ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              style={{
                ...styles.primaryButton,
                ...(!canSubmit ? styles.primaryButtonDisabled : {}),
              }}
              disabled={!canSubmit}
            >
              {busy ? (
                <span style={styles.submitContent}>
                  <span style={styles.spinner} aria-hidden />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </div>
        </form>

        <p style={styles.footer}>
          Admin credentials are separate from worker face login. Workers enrolled
          here skip the pending review queue.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: overlayShellStyles.root,
  panel: {
    ...overlayShellStyles.panel,
    width: "min(460px, 100%)",
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
  iconButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    background: BRAND_DERIVED.panel,
    color: BRAND_DERIVED.textMuted,
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
  },
  subtitle: overlayShellStyles.subtitle,
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
