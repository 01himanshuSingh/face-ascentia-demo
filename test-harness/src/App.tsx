import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  createFaceAuthSDK,
  isFaceAuthApiError,
  type CapturePhase,
  type FaceAuthSDK,
  type MendixAuthenticateResult,
  type RegisterResult,
} from "@face-auth/sdk";

/**
 * Mendix integration stand-in.
 *
 * Mendix page: Employee ID + Authenticate only.
 * SDK: camera, blink, capture, backend verify, Register overlay when not enrolled.
 */
export function App() {
  const sdkRef = useRef<FaceAuthSDK | null>(null);
  const [employeeId, setEmployeeId] = useState("EMP003");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [status, setStatus] = useState(
    "Enter Employee ID and tap Authenticate. If not enrolled, select Plant + name in Register UI.",
  );
  const [authResult, setAuthResult] = useState<MendixAuthenticateResult | null>(
    null,
  );
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(
    null,
  );

  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
    (import.meta.env.DEV ? "/api" : undefined);

  useEffect(() => {
    const sdk = createFaceAuthSDK({
      apiBaseUrl,
      title: "Face authentication",
      onPhaseChange: setPhase,
      // Do not clear busy here — camera closes before authenticate/register finishes.
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
      setRegisterResult(null);
      return;
    }

    if (!apiBaseUrl?.trim()) {
      setStatus("Configure VITE_API_BASE_URL (Debian face-auth API origin).");
      setAuthResult(null);
      setRegisterResult(null);
      return;
    }

    setBusy(true);
    setAuthResult(null);
    setRegisterResult(null);
    setStatus("SDK — camera, blink, capture, then POST /authenticate…");

    try {
      const outcome = await sdk.authenticateOrRegister(id);

      if (outcome.outcome === "authenticated") {
        setAuthResult({
          employeeId: outcome.employeeId,
          authenticated: true,
        });
        setStatus(
          "authenticated: true — Mendix may start its login session / navigation.",
        );
        return;
      }

      if (outcome.outcome === "denied") {
        setAuthResult({
          employeeId: outcome.employeeId,
          authenticated: false,
        });
        setStatus(
          "authenticated: false — face did not match enrollment. Mendix denies login.",
        );
        return;
      }

      setRegisterResult(outcome.registration);
      setStatus(
        `${outcome.registration.message} (requestId: ${outcome.registration.requestId}, status: ${outcome.registration.status})`,
      );
    } catch (error) {
      setAuthResult(null);
      setRegisterResult(null);

      if (isFaceAuthApiError(error)) {
        setStatus(`${error.detail} (${error.code})`);
      } else if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === "CANCELLED"
      ) {
        setStatus("Capture or registration cancelled.");
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
          Mendix: Employee ID + Authenticate. If not enrolled, SDK opens Register UI
          (Plant + Employee ID + Full name — photo reused from auth).
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
            placeholder="e.g. EMP003 (employee, no enrollment)"
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
            {busy ? "Working…" : "Authenticate"}
          </button>
        </form>

        <p style={styles.meta}>
          Capture phase: {phase}
          {apiBaseUrl ? ` · API ${apiBaseUrl}` : " · API not configured"}
        </p>

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

        {registerResult && (
          <div
            style={{
              ...styles.resultBadge,
              ...styles.resultPending,
            }}
            role="status"
            aria-live="polite"
          >
            <strong>registration: {registerResult.status}</strong>
            <span>employeeId: {registerResult.employeeId}</span>
            <span>requestId: {registerResult.requestId}</span>
          </div>
        )}

        <p style={styles.status}>{status}</p>

        <section style={styles.integrationBox}>
          <p style={styles.integrationTitle}>Mendix wiring (reference)</p>
          <pre style={styles.integrationCode}>{`const sdk = createFaceAuthSDK({
  apiBaseUrl: "${apiBaseUrl ?? "https://face-auth.customer.example"}",
});

const outcome = await sdk.authenticateOrRegister(employeeId);
if (outcome.outcome === "authenticated") {
  // Mendix login session
} else if (outcome.outcome === "registered") {
  // PENDING — wait for admin portal approve
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
  resultPending: {
    background: "#fef9e7",
    border: "1px solid #f0d060",
    color: "#7a5c00",
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
