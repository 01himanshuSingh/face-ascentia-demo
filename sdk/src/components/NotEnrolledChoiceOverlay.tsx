import type { CSSProperties, ReactElement } from "react";

import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

/**
 * User selection after authenticate returns not-enrolled (SDK STATE 3).
 *
 * Mendix integration
 * ------------------
 * Mendix never renders this directly — FaceAuthSDK mounts it after
 * `authenticate()` / `authenticateOrRegister()` when the backend returns
 * ENROLLMENT_NOT_FOUND or EMPLOYEE_NOT_FOUND.
 *
 *   Employee Register  → Path A (reuse auth JPEG, PENDING → Admin Portal)
 *   Admin Kiosk Login  → Path B (admin password, fresh capture per worker)
 *
 * Advanced / white-label hosts may import this component from the npm package
 * and mount it manually if they bypass FaceAuthSDK (not recommended).
 *
 *   import { NotEnrolledChoiceOverlay } from "@face-auth/sdk";
 */

/** Which branch the user selected — informational for hosts/tests. */
export type NotEnrolledChoice = "employee_register" | "admin_kiosk_login";

export interface NotEnrolledChoiceOverlayProps {
  /** When false, renders nothing (SDK keeps host mounted). */
  open: boolean;

  /**
   * Employee ID from the failed authenticate attempt (Mendix field value).
   * Shown read-only for context — user may still edit in Register overlay.
   */
  employeeId?: string;

  /** Modal title override. */
  title?: string;

  /** Body copy override. */
  subtitle?: string;

  /** Primary Path A button label. */
  employeeRegisterLabel?: string;

  /** Primary Path B button label. */
  adminKioskLoginLabel?: string;

  /** Disable actions while SDK transitions to next overlay. */
  busy?: boolean;

  /** Path A — open Register overlay (Plant + name; reuse capture). */
  onChooseEmployeeRegister: () => void;

  /** Path B — open admin kiosk login overlay. */
  onChooseAdminKioskLogin: () => void;

  /** Dismiss without choosing — returns user to Mendix idle (clears capture in SDK). */
  onCancel?: () => void;
}

const DEFAULT_TITLE = "Face enrollment required";
const DEFAULT_SUBTITLE =
  "This Employee ID is not enrolled for face login yet. Choose how to continue.";
const DEFAULT_EMPLOYEE_REGISTER_LABEL = "Employee Register";
const DEFAULT_ADMIN_KIOSK_LABEL = "Admin Kiosk Login";

/**
 * STATE 3 overlay — two explicit paths; does not auto-open Register.
 */
export function NotEnrolledChoiceOverlay({
  open,
  employeeId = "",
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  employeeRegisterLabel = DEFAULT_EMPLOYEE_REGISTER_LABEL,
  adminKioskLoginLabel = DEFAULT_ADMIN_KIOSK_LABEL,
  busy = false,
  onChooseEmployeeRegister,
  onChooseAdminKioskLogin,
  onCancel,
}: NotEnrolledChoiceOverlayProps): ReactElement | null {
  if (!open) {
    return null;
  }

  const trimmedId = employeeId.trim();
  const actionsDisabled = busy;

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="not-enrolled-choice-title"
      aria-describedby="not-enrolled-choice-desc"
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <p style={styles.eyebrow}>Face Authentication</p>
            <h2 id="not-enrolled-choice-title" style={styles.title}>
              {title}
            </h2>
          </div>
          {onCancel ? (
            <button
              type="button"
              style={{
                ...styles.iconButton,
                ...(actionsDisabled ? styles.iconButtonDisabled : {}),
              }}
              onClick={onCancel}
              disabled={actionsDisabled}
              aria-label="Close"
            >
              ×
            </button>
          ) : null}
        </header>

        <p id="not-enrolled-choice-desc" style={styles.subtitle}>
          {subtitle}
        </p>

        {trimmedId ? (
          <div style={styles.contextCard} aria-label="Employee ID from authenticate">
            <span style={styles.contextLabel}>Employee ID</span>
            <span style={styles.contextValue}>{trimmedId}</span>
          </div>
        ) : null}

        <div style={styles.choiceStack}>
          <button
            type="button"
            style={{
              ...styles.choiceButton,
              ...styles.choiceButtonPrimary,
              ...(actionsDisabled ? styles.choiceButtonDisabled : {}),
            }}
            onClick={onChooseEmployeeRegister}
            disabled={actionsDisabled}
          >
            <span style={styles.choiceButtonTitle}>{employeeRegisterLabel}</span>
            <span style={styles.choiceButtonHint}>
              Submit your details — plant admin approves later
            </span>
          </button>

          <button
            type="button"
            style={{
              ...styles.choiceButton,
              ...styles.choiceButtonSecondary,
              ...(actionsDisabled ? styles.choiceButtonDisabled : {}),
            }}
            onClick={onChooseAdminKioskLogin}
            disabled={actionsDisabled}
          >
            <span style={styles.choiceButtonTitle}>{adminKioskLoginLabel}</span>
            <span style={styles.choiceButtonHint}>
              Plant admin enrolls workers on this kiosk — active immediately
            </span>
          </button>
        </div>

        {onCancel ? (
          <div style={styles.footerActions}>
            <button
              type="button"
              style={{
                ...styles.textButton,
                ...(actionsDisabled ? styles.textButtonDisabled : {}),
              }}
              onClick={onCancel}
              disabled={actionsDisabled}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <p style={styles.footer}>
          Mendix login is only available after face enrollment is complete.
        </p>
      </div>
    </div>
  );
}

/** Shared visual language with RegisterOverlay — self-contained inline styles for npm. */
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
  iconButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  subtitle: overlayShellStyles.subtitle,
  contextCard: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${BRAND.border}`,
    background: BRAND.background,
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: BRAND_DERIVED.textMuted,
  },
  contextValue: {
    fontSize: 16,
    fontWeight: 600,
    color: BRAND.primary,
    fontVariantNumeric: "tabular-nums",
  },
  choiceStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 4,
  },
  choiceButton: {
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
    padding: "16px 18px",
    borderRadius: 12,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
  },
  choiceButtonPrimary: {
    border: `2px solid ${BRAND.primary}`,
    background: BRAND_DERIVED.primaryTint,
  },
  choiceButtonSecondary: {
    border: `1px solid ${BRAND.border}`,
    background: BRAND_DERIVED.panel,
  },
  choiceButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  choiceButtonTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: BRAND.text,
    lineHeight: 1.3,
  },
  choiceButtonHint: {
    fontSize: 13,
    fontWeight: 400,
    color: BRAND_DERIVED.textMuted,
    lineHeight: 1.45,
  },
  footerActions: {
    display: "flex",
    justifyContent: "center",
    marginTop: 2,
  },
  textButton: {
    border: "none",
    background: "transparent",
    color: BRAND_DERIVED.textMuted,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 12px",
  },
  textButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  footer: overlayShellStyles.footer,
};
