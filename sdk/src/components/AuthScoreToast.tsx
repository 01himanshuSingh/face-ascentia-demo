import { useEffect, type CSSProperties, type ReactElement } from "react";

import type { SdkFeedbackPayload } from "../ui/feedbackToast.types";

export type AuthScoreToastProps = SdkFeedbackPayload & {
  onDismiss?: () => void;
};

const VARIANT_STYLES: Record<
  SdkFeedbackPayload["variant"],
  { accent: string; bg: string; border: string; icon: string }
> = {
  success: {
    accent: "#166534",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "✓",
  },
  warning: {
    accent: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: "!",
  },
  error: {
    accent: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "✕",
  },
  info: {
    accent: "#1e3a5f",
    bg: "#f8fafc",
    border: "#cbd5e1",
    icon: "i",
  },
};

/**
 * Mendix-facing operator toast — auth scores, thresholds, backend/capture errors.
 * Rendered by the SDK only; Mendix page stays Employee ID + Authenticate.
 */
export function AuthScoreToast({
  variant,
  title,
  message,
  code,
  details = [],
  onDismiss,
}: AuthScoreToastProps): ReactElement {
  const palette = VARIANT_STYLES[variant];

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
        }}
      >
        <div style={styles.header}>
          <span
            style={{
              ...styles.icon,
              color: palette.accent,
              borderColor: palette.border,
            }}
            aria-hidden
          >
            {palette.icon}
          </span>
          <div style={styles.headerCopy}>
            <p style={{ ...styles.title, color: palette.accent }}>{title}</p>
            {code ? <p style={styles.code}>{code}</p> : null}
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
    width: "min(380px, calc(100vw - 32px))",
    pointerEvents: "none",
    fontFamily:
      '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  toast: {
    pointerEvents: "auto",
    border: "1px solid",
    borderRadius: 12,
    padding: "14px 16px",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.14)",
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
    background: "#ffffff",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  code: {
    margin: "2px 0 0",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748b",
  },
  dismiss: {
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: "#64748b",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  message: {
    margin: "10px 0 0",
    fontSize: 13,
    lineHeight: 1.5,
    color: "#334155",
  },
  details: {
    margin: "12px 0 0",
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.72)",
    display: "grid",
    gap: 6,
  },
  detailRow: {
    display: "grid",
    gridTemplateColumns: "118px 1fr",
    gap: 8,
    fontSize: 12,
  },
  detailLabel: {
    margin: 0,
    color: "#64748b",
    fontWeight: 500,
  },
  detailValue: {
    margin: 0,
    color: "#0f172a",
    fontWeight: 600,
    wordBreak: "break-word",
  },
};
