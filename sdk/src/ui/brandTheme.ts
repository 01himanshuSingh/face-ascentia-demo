import type { CSSProperties } from "react";

/** Brand palette — shared across SDK overlays and test harness. */
export const BRAND = {
  primary: "#00843D",
  secondary: "#F5A400",
  background: "#F7F8F6",
  text: "#1F2937",
  border: "#D9DED9",
} as const;

export const BRAND_DERIVED = {
  primaryHover: "#006B31",
  primaryTint: "#E6F4EC",
  secondaryTint: "#FFF8E6",
  textMuted: "#6B7280",
  textSubtle: "#9CA3AF",
  panel: "#FFFFFF",
  overlayBackdrop: "rgba(31, 41, 55, 0.52)",
  focusRing: "rgba(0, 132, 61, 0.12)",
  panelShadow: "0 24px 60px rgba(31, 41, 55, 0.14)",
  fontFamily:
    '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
} as const;

/** Shared overlay shell styles (Register, NotEnrolledChoice, etc.). */
export const overlayShellStyles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: BRAND_DERIVED.overlayBackdrop,
    padding: 16,
    boxSizing: "border-box",
    fontFamily: BRAND_DERIVED.fontFamily,
  },
  panel: {
    background: BRAND_DERIVED.panel,
    color: BRAND.text,
    borderRadius: 16,
    border: `1px solid ${BRAND.border}`,
    boxShadow: BRAND_DERIVED.panelShadow,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: BRAND.primary,
  },
  title: {
    margin: "6px 0 0",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
    color: BRAND.text,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: BRAND_DERIVED.textMuted,
  },
  footer: {
    margin: "2px 0 0",
    fontSize: 12,
    lineHeight: 1.5,
    color: BRAND_DERIVED.textSubtle,
    borderTop: `1px solid ${BRAND.background}`,
    paddingTop: 14,
  },
};

/** Toast variant colors aligned with brand palette. */
export const FEEDBACK_TOAST_PALETTE = {
  success: {
    accent: BRAND.primary,
    bg: BRAND_DERIVED.primaryTint,
    border: "#9fd4b3",
    icon: "✓",
  },
  warning: {
    accent: "#9a6700",
    bg: BRAND_DERIVED.secondaryTint,
    border: "#f5d066",
    icon: "!",
  },
  error: {
    accent: "#b42318",
    bg: "#fef3f2",
    border: "#fecdca",
    icon: "✕",
  },
  info: {
    accent: BRAND.primary,
    bg: BRAND.background,
    border: BRAND.border,
    icon: "i",
  },
} as const;
