/**
 * Harness-only brand tokens (not part of @ascentia/face-auth-sdk public API).
 * Kept local so Vercel can deploy test-harness without the sdk/ source tree.
 */
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
