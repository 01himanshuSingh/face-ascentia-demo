import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  createFaceAuthClient,
  createFaceAuthSDK,
  FaceAuthApiError,
  type AuthenticateResult,
  type CapturePhase,
  type FaceAuthSDK,
  type MendixAuthenticateResult,
} from "@face-auth/sdk";

/**
 * Mendix integration stand-in.
 *
 * This file shows exactly what the Mendix team wires in their host page:
 *
 *   const sdk = createFaceAuthSDK({ apiBaseUrl: "https://face-auth.customer.example" });
 *   const { employeeId, authenticated } = await sdk.authenticate(employeeIdFromMendix);
 *   if (authenticated) { /* allow app login *\/ }
 *
 * Mendix owns: Employee ID field, Authenticate button, business navigation.
 * SDK owns: camera UI, blink, capture, HTTPS call to Debian backend.
 */
export function App() {
  const sdkRef = useRef<FaceAuthSDK | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [status, setStatus] = useState(
    "Enter Employee ID and tap Authenticate.",
  );
  const [authResult, setAuthResult] = useState<MendixAuthenticateResult | null>(
    null,
  );
  const [authDetail, setAuthDetail] = useState<AuthenticateResult | null>(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  useEffect(() => {
    const sdk = createFaceAuthSDK({
      apiBaseUrl,
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
  }, [apiBaseUrl]);

  const onAuthenticate = async (event: FormEvent) => {
    event.preventDefault();
    const sdk = sdkRef.current;
    if (!sdk || busy) {
      return;
    }

    const id = employeeId.trim();
    if (!id) {
      setStatus("Employee ID is required.");
      setAuthResult(null);
      return;
    }

    if (!apiBaseUrl?.trim()) {
      setStatus("Configure VITE_API_BASE_URL (Debian face-auth API origin).");
      setAuthResult(null);
      return;
    }

    setBusy(true);
    setAuthResult(null);
    setAuthDetail(null);
    setStatus("SDK started — camera, blink, capture, then backend verify…");

    try {
      // Mendix production: await sdk.authenticate(id) → { employeeId, authenticated }
      // Harness dev: capture + client so we can show score/threshold on screen.
      const frame = await sdk.captureFace();
      const detail = await createFaceAuthClient({ apiBaseUrl: apiBaseUrl.trim() }).authenticate({
        employeeId: id,
        image: frame,
      });

      const mendixResult: MendixAuthenticateResult = {
        employeeId: detail.employeeId,
        authenticated: detail.authenticated,
      };
      setAuthResult(mendixResult);
      setAuthDetail(detail);

      const scoreText =
        detail.score != null ? detail.score.toFixed(3) : "n/a";
      const thresholdText = detail.threshold.toFixed(3);

      if (detail.authenticated) {
        setStatus(
          `Match YES — score ${scoreText} ≥ threshold ${thresholdText}. Mendix allows login.`,
        );
      } else {
        setStatus(
          `Match NO — score ${scoreText} < threshold ${thresholdText}. Mendix denies login.`,
        );
      }
    } catch (error) {
      setAuthResult(null);
      if (error instanceof FaceAuthApiError) {
        setStatus(`${error.detail} (${error.code})`);
      } else {
        const message =
          error instanceof Error ? error.message : "Authentication failed.";
        setStatus(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <p style={styles.eyebrow}>Face Auth · Mendix integration sample</p>
        <h1 style={styles.title}>Host page stand-in</h1>
        <p style={styles.copy}>
          Same contract the Mendix team uses: pass <code style={styles.inlineCode}>apiBaseUrl</code>,
          call <code style={styles.inlineCode}>authenticate(employeeId)</code>, branch on{" "}
          <code style={styles.inlineCode}>authenticated</code>. Mendix never opens the camera
          or calls the backend directly.
        </p>

        <form style={styles.form} onSubmit={onAuthenticate}>
          <label style={styles.label} htmlFor="employee-id">
            Employee ID <span style={styles.hint}>(from Mendix)</span>
          </label>
          <input
            id="employee-id"
            style={styles.input}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="e.g. EMP001"
            autoComplete="off"
            disabled={busy}
          />

          <button
            type="submit"
            style={{
              ...styles.primary,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? "wait" : "pointer",
            }}
            disabled={busy}
          >
            {busy ? "Authenticating…" : "Authenticate"}
          </button>
        </form>

        <p style={styles.meta}>
          Capture phase: {phase}
          {apiBaseUrl ? ` · API ${apiBaseUrl}` : " · API not configured"}
        </p>

        {authDetail && (
          <p style={styles.metrics}>
            face_score={authDetail.score?.toFixed(3) ?? "n/a"} · threshold=
            {authDetail.threshold.toFixed(3)} · match=
            {authDetail.authenticated ? "YES" : "NO"}
          </p>
        )}

        {authResult && (
          <div
            style={{
              ...styles.resultBadge,
              ...(authResult.authenticated ? styles.resultSuccess : styles.resultDenied),
            }}
            role="status"
            aria-live="polite"
          >
            <strong>
              {authResult.authenticated ? "authenticated: true" : "authenticated: false"}
            </strong>
            <span>employeeId: {authResult.employeeId}</span>
          </div>
        )}

        <p style={styles.status}>{status}</p>

        <section style={styles.integrationBox}>
          <p style={styles.integrationTitle}>Mendix wiring (reference)</p>
          <pre style={styles.integrationCode}>{`const sdk = createFaceAuthSDK({
  apiBaseUrl: "${apiBaseUrl ?? "https://face-auth.customer.example"}",
});

const { employeeId, authenticated } =
  await sdk.authenticate(employeeIdFromMendix);

if (authenticated) {
  // proceed with Mendix session / navigation
}`}</pre>
        </section>
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
    width: "min(480px, 100%)",
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
  inlineCode: {
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.92em",
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
  hint: {
    fontWeight: 400,
    color: "#5c6570",
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
  },
  meta: {
    margin: 0,
    fontSize: 12,
    color: "#5c6570",
    wordBreak: "break-all",
  },
  resultBadge: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 8,
    fontSize: 14,
  },
  resultSuccess: {
    background: "#e6f4ea",
    border: "1px solid #8fd19e",
    color: "#0d5724",
  },
  resultDenied: {
    background: "#fdecea",
    border: "1px solid #f5a8a0",
    color: "#8a1f17",
  },
  metrics: {
    margin: 0,
    fontSize: 13,
    fontFamily: "ui-monospace, monospace",
    color: "#1f3a5f",
  },
  status: {
    margin: 0,
    fontSize: 14,
    color: "#3d4550",
    minHeight: 40,
  },
  integrationBox: {
    marginTop: 4,
    padding: "12px 14px",
    borderRadius: 8,
    background: "#f7f8fa",
    border: "1px solid #d8dde3",
  },
  integrationTitle: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#5c6570",
  },
  integrationCode: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: "auto",
    fontFamily: "ui-monospace, monospace",
    color: "#1a1a1a",
  },
};
