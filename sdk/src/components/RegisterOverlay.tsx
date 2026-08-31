import { useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import { PlantSelectDropdown } from "./PlantSelectDropdown";
import type { PlantListItem } from "../types/registration.types";

export interface RegisterSubmitPayload {
  employeeId: string;
  plantId: string;
  fullName: string;
}

export interface RegisterOverlayProps {
  open: boolean;
  plants: PlantListItem[];
  defaultEmployeeId?: string;
  defaultFullName?: string;
  defaultPlantId?: string;
  subtitle?: string;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: RegisterSubmitPayload) => void;
  onCancel?: () => void;
}

/**
 * Registration-first Path A — Plant + Employee ID + Full name (no camera).
 * Face JPEG is reused from the prior authenticate capture.
 */
export function RegisterOverlay({
  open,
  plants,
  defaultEmployeeId = "",
  defaultFullName = "",
  defaultPlantId = "",
  subtitle = "Complete your details after successful face capture.",
  busy = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: RegisterOverlayProps): ReactElement | null {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [fullName, setFullName] = useState(defaultFullName);
  const [plantId, setPlantId] = useState(defaultPlantId);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const canSubmit =
    employeeId.trim().length > 0 &&
    fullName.trim().length > 0 &&
    plantId.trim().length > 0 &&
    !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      employeeId: employeeId.trim(),
      plantId: plantId.trim(),
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
      aria-labelledby="register-title"
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <p style={styles.eyebrow}>Face Authentication</p>
            <h2 id="register-title" style={styles.title}>
              Register for Face Login
            </h2>
          </div>
          {onCancel ? (
            <button
              type="button"
              style={styles.iconButton}
              onClick={onCancel}
              disabled={busy}
              aria-label="Close registration"
            >
              ×
            </button>
          ) : null}
        </header>

        <p style={styles.subtitle}>{subtitle}</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-register-plant">
              Plant
            </label>
            <PlantSelectDropdown
              labelId="face-auth-register-plant"
              plants={plants}
              value={plantId}
              onChange={setPlantId}
              disabled={busy}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-register-employee-id">
              Employee ID
            </label>
            <input
              id="face-auth-register-employee-id"
              style={inputStyle("employeeId")}
              type="text"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              onFocus={() => setFocusedField("employeeId")}
              onBlur={() => setFocusedField(null)}
              placeholder="Employee ID"
              autoComplete="off"
              disabled={busy}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="face-auth-register-full-name">
              Full Name
            </label>
            <input
              id="face-auth-register-full-name"
              style={inputStyle("fullName")}
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => setFocusedField(null)}
              placeholder="Full name"
              autoComplete="name"
              disabled={busy}
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
            {onCancel ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
            ) : (
              <span />
            )}
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
                  Submitting…
                </span>
              ) : (
                "Submit registration"
              )}
            </button>
          </div>
        </form>

        <p style={styles.footer}>
          Your plant admin will verify the details before approval.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(15, 23, 42, 0.52)",
    padding: 16,
    boxSizing: "border-box",
    fontFamily:
      '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  panel: {
    width: "min(460px, 100%)",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.14)",
    padding: "24px 24px 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14,
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
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#64748b",
  },
  title: {
    margin: "6px 0 0",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
    color: "#1e3a5f",
  },
  iconButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    background: "#ffffff",
    color: "#475569",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: "#64748b",
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
    color: "#334155",
    letterSpacing: "0.01em",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 46,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "11px 14px",
    fontSize: 15,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  },
  inputFocused: {
    borderColor: "#1e3a5f",
    boxShadow: "0 0 0 3px rgba(30, 58, 95, 0.12)",
  },
  inputDisabled: {
    background: "#f8fafc",
    color: "#64748b",
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
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#334155",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryButton: {
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 8,
    border: "none",
    background: "#1e3a5f",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "auto",
    transition: "background-color 120ms ease, opacity 120ms ease",
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
  footer: {
    margin: "2px 0 0",
    fontSize: 12,
    lineHeight: 1.5,
    color: "#94a3b8",
    borderTop: "1px solid #f1f5f9",
    paddingTop: 14,
  },
};

// Spinner keyframes — injected once for SDK overlay (no external CSS dependency).
if (
  typeof document !== "undefined" &&
  !document.getElementById("far-register-overlay-styles")
) {
  const style = document.createElement("style");
  style.id = "far-register-overlay-styles";
  style.textContent = `
    @keyframes far-register-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
