import type { CSSProperties, ReactElement } from "react";

import type { CapturePhase } from "../types/auth.types";

export interface CaptureStatusProps {
  phase: CapturePhase;
  message?: string;
}

const PHASE_COPY: Record<CapturePhase, string> = {
  idle: "Ready",
  starting_camera: "Starting camera…",
  searching_face: "Look at the camera",
  face_detected: "Face detected",
  blink_prompt: "Blink once",
  capturing: "Selecting best frame…",
  completed: "Capture complete",
  cancelled: "Cancelled",
  error: "Something went wrong",
};

/**
 * Lightweight status line for the SDK overlay.
 * Mendix never renders this — it ships inside CameraOverlay.
 */
export function CaptureStatus({
  phase,
  message,
}: CaptureStatusProps): ReactElement {
  return (
    <p style={styles.text} data-capture-phase={phase} role="status">
      {message ?? PHASE_COPY[phase]}
    </p>
  );
}

const styles: Record<string, CSSProperties> = {
  text: {
    margin: 0,
    textAlign: "center",
    fontSize: 15,
    color: "#e5e7eb",
  },
};
