import { useEffect, type CSSProperties, type ReactElement } from "react";

import type { SdkFeedbackPayload } from "../ui/feedbackToast.types";
import { BRAND, BRAND_DERIVED, FEEDBACK_TOAST_PALETTE } from "../ui/brandTheme";

export type AuthScoreToastProps = SdkFeedbackPayload & {
  onDismiss?: () => void;
};

/**
 * Operator feedback toast — auth scores, enroll errors, capture guidance.
 * Brand-themed; Mendix page stays Employee ID + Authenticate only.
 */
export function AuthScoreToast({
  variant,
  title,
  message,
  code,
  hint,
  details = [],
  onDismiss,
}: AuthScoreToastProps): ReactElement {
  const palette = FEEDBACK_TOAST_PALETTE[variant];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      style={styles.viewport}
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        style={{
          ...styles.toast,
          background: palette.bg,
          borderColor: palette.border,
          boxShadow: `${BRAND_DERIVED.panelShadow}, inset 4px 0 0 ${palette.accent}`,
        }}
      >
        <div style={styles.header}>
          <span
            style={{
              ...styles.icon,
              color: palette.accent,
              borderColor: palette.border,
              background: BRAND_DERIVED.panel,
            }}
            aria-hidden
          >
            {palette.icon}
          </span>
          <div style={styles.headerCopy}>
            <p style={{ ...styles.title, color: BRAND.text }}>{title}</p>
          </div>
          {onDismiss ? (
            <button
              type="button"
              style={styles.dismiss}
              onClick={onDismiss}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          ) : null}
        </div>

        <p style={styles.message}>{message}</p>

        {hint ? (
          <p
            style={{
              ...styles.hint,
              ...(variant === "success" || variant === "info"
                ? styles.hintPositive
                : variant === "warning"
                  ? styles.hintWarning
                  : styles.hintError),
            }}
          >
            {hint}
          </p>
        ) : null}

        {details.length > 0 ? (
          <dl style={styles.details}>
            {details.map((row) => (
              <div key={`${row.label}-${row.value}`} style={styles.detailRow}>
                <dt style={styles.detailLabel}>{row.label}</dt>
                <dd style={styles.detailValue}>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {code ? (
          <p style={styles.supportCode} aria-hidden>
            Ref: {code}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  viewport: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 10000,
    width: "min(400px, calc(100vw - 32px))",
    pointerEvents: "none",
    fontFamily: BRAND_DERIVED.fontFamily,
  },
  toast: {
    pointerEvents: "auto",
    border: "1px solid",
    borderRadius: 12,
    padding: "14px 16px 12px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: "999px",
    border: "1px solid",
    display: "grid",
    placeItems: "center",
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  dismiss: {
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: BRAND_DERIVED.textMuted,
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  message: {
    margin: "8px 0 0",
    fontSize: 13,
    lineHeight: 1.55,
    color: BRAND.text,
  },
  hint: {
    margin: "10px 0 0",
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1.45,
    fontWeight: 500,
  },
  hintPositive: {
    background: "rgba(255, 255, 255, 0.65)",
    color: BRAND_DERIVED.primaryHover,
    border: `1px solid ${BRAND.border}`,
  },
  hintWarning: {
    background: "rgba(255, 255, 255, 0.72)",
    color: "#7a5c00",
    border: `1px solid #f5d066`,
  },
  hintError: {
    background: "rgba(255, 255, 255, 0.72)",
    color: "#912018",
    border: "1px solid #fecdca",
  },
  details: {
    margin: "10px 0 0",
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.72)",
    border: `1px solid ${BRAND.border}`,
    display: "grid",
    gap: 6,
  },
  detailRow: {
    display: "grid",
    gridTemplateColumns: "112px 1fr",
    gap: 8,
    fontSize: 12,
  },
  detailLabel: {
    margin: 0,
    color: BRAND_DERIVED.textMuted,
    fontWeight: 500,
  },
  detailValue: {
    margin: 0,
    color: BRAND.text,
    fontWeight: 600,
    wordBreak: "break-word",
  },
  supportCode: {
    margin: "8px 0 0",
    fontSize: 10,
    letterSpacing: "0.04em",
    color: BRAND_DERIVED.textSubtle,
    textAlign: "right",
  },
};
