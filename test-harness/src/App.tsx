import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  createFaceAuthSDK,
  type CapturePhase,
  type FaceAuthSDK,
  type FaceCaptureResult,
} from "@face-auth/sdk";

/**
 * Mendix stand-in.
 * One Authenticate action → SDK owns camera UI + face → blink → burst → auto-close.
 */
export function App() {
  const sdkRef = useRef<FaceAuthSDK | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [status, setStatus] = useState(
    "Enter Employee ID and tap Authenticate (SDK captures face).",
  );
  const [lastCapture, setLastCapture] = useState<FaceCaptureResult | null>(null);

  useEffect(() => {
    const sdk = createFaceAuthSDK({
      // Debian face-auth API will be set here for real auth later.
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
      title: "Face authentication",
      onPhaseChange: setPhase,
      onCameraClose: () => {
        setBusy(false);
      },
    });
    sdkRef.current = sdk;

    return () => {
      void sdk.destroy();
      sdkRef.current = null;
    };
  }, []);

  const onAuthenticate = async (event: FormEvent) => {
    event.preventDefault();
    const sdk = sdkRef.current;
    if (!sdk || busy) {
      return;
    }

    setBusy(true);
    setLastCapture(null);
    setStatus("SDK capture started…");

    try {
      const frame = await sdk.captureFace();
      setLastCapture(frame);
      setStatus(
        employeeId.trim()
          ? `Captured for ${employeeId.trim()} (${frame.width}×${frame.height}, ${frame.framesConsidered} frames). Ready for Debian /authenticate.`
          : `Captured (${frame.width}×${frame.height}). Ready for Debian /authenticate.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Capture failed.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <p style={styles.eyebrow}>Face Auth · Test Harness</p>
        <h1 style={styles.title}>Mendix stand-in</h1>
        <p style={styles.copy}>
          Mimics the Mendix host: one Authenticate button. The npm SDK opens its
          own overlay, then face → blink → burst → auto-close. Backend auth stays
          on the Debian server.
        </p>

        <form style={styles.form} onSubmit={onAuthenticate}>
          <label style={styles.label} htmlFor="employee-id">
            Employee ID
          </label>
          <input
            id="employee-id"
            style={styles.input}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="e.g. EMP001"
            autoComplete="off"
          />

          <button type="submit" style={styles.primary} disabled={busy}>
            Authenticate
          </button>
        </form>

        <p style={styles.meta}>Phase: {phase}</p>
        <p style={styles.status} role="status">
          {status}
        </p>

        {lastCapture && (
          <img
            src={lastCapture.dataUrl}
            alt="Best captured frame"
            style={styles.preview}
          />
        )}
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    background:
      "radial-gradient(circle at top left, #e8eef7 0%, #f5f5f0 45%, #ebe6dc 100%)",
    color: "#1a1a1a",
  },
  card: {
    width: "min(440px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#5c6570",
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
    fontWeight: 650,
  },
  copy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: "#3d4550",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    border: "1px solid #c5cad1",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 16,
    background: "#fff",
  },
  primary: {
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    background: "#1f3a5f",
    color: "#fff",
    cursor: "pointer",
  },
  meta: {
    margin: 0,
    fontSize: 12,
    color: "#5c6570",
  },
  status: {
    margin: 0,
    fontSize: 14,
    color: "#3d4550",
    minHeight: 40,
  },
  preview: {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #c5cad1",
  },
};
