import { useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import { PlantSelectDropdown } from "./PlantSelectDropdown";
import type { PlantListItem } from "../types/registration.types";
import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

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
 * Registration-first Path A — Plant + Employee ID (no camera).
 * Full name is not collected at kiosk; SDK sends Employee ID as display name.
 * Face JPEG is reused from the prior authenticate capture.
 */
export function RegisterOverlay({
  open,
  plants,
  defaultEmployeeId = "",
  defaultFullName: _defaultFullName = "",
  defaultPlantId = "",
  subtitle = "Select your plant and Employee ID after successful face capture.",
  busy = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: RegisterOverlayProps): ReactElement | null {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [plantId, setPlantId] = useState(defaultPlantId);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const canSubmit =
    employeeId.trim().length > 0 &&
    plantId.trim().length > 0 &&
    !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const id = employeeId.trim();
    onSubmit({
      employeeId: id,
      plantId: plantId.trim(),
      // Client policy: no name at kiosk — reuse Employee ID for DB full_name.
      fullName: id,
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
    letterSpacing: "0.01em",
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
    transition: "border-color 120ms ease, box-shadow 120ms ease",
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
  footer: overlayShellStyles.footer,
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
