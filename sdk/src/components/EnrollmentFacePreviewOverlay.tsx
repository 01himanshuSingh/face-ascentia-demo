import { type CSSProperties, type ReactElement } from "react";

import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

export interface EnrollmentFacePreviewOverlayProps {
  open: boolean;
  /** JPEG data URL from FaceCaptureResult.dataUrl */
  dataUrl: string;
  caption: string;
  subtitle?: string;
  /** Auto-dismiss progress bar duration (ms). */
  durationMs?: number;
}

/**
 * Brief enrollment face preview — shown after capture, before register submit
 * or admin kiosk enroll API call. SDK-internal only (not Mendix-facing).
 */
export function EnrollmentFacePreviewOverlay({
  open,
  dataUrl,
  caption,
  subtitle,
  durationMs = 1800,
}: EnrollmentFacePreviewOverlayProps): ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="enrollment-preview-caption"
      aria-live="polite"
    >
      <div style={styles.panel}>
        <div style={styles.imageFrame}>
          <img
            src={dataUrl}
            alt="Captured enrollment face"
            style={styles.image}
          />
          <span style={styles.badge} aria-hidden>
            ✓
          </span>
        </div>

        <h2 id="enrollment-preview-caption" style={styles.caption}>
          {caption}
        </h2>
        {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}

        <div style={styles.progressTrack} aria-hidden>
          <div
            style={{
              ...styles.progressFill,
              animationDuration: `${durationMs}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    ...overlayShellStyles.root,
    zIndex: 10001,
  },
  panel: {
    ...overlayShellStyles.panel,
    width: "min(380px, calc(100vw - 32px))",
    padding: "20px 20px 18px",
    alignItems: "center",
    textAlign: "center",
    animation: "far-enrollment-preview-in 220ms ease-out",
  },
  imageFrame: {
    position: "relative",
    width: "min(240px, 72vw)",
    aspectRatio: "3 / 4",
    borderRadius: 16,
    overflow: "hidden",
    border: `3px solid ${BRAND.primary}`,
    boxShadow: `0 12px 32px rgba(0, 132, 61, 0.18)`,
    background: "#000",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transform: "scaleX(-1)",
  },
  badge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: "999px",
    background: BRAND.primary,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
  },
  caption: {
    margin: "4px 0 0",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.3,
    color: BRAND.text,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: BRAND_DERIVED.textMuted,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    background: BRAND.background,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    width: "100%",
    borderRadius: 999,
    background: BRAND.primary,
    transformOrigin: "left center",
    animationName: "far-enrollment-preview-progress",
    animationTimingFunction: "linear",
    animationFillMode: "forwards",
  },
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("far-enrollment-preview-styles")
) {
  const style = document.createElement("style");
  style.id = "far-enrollment-preview-styles";
  style.textContent = `
    @keyframes far-enrollment-preview-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes far-enrollment-preview-progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
  `;
  document.head.appendChild(style);
}
