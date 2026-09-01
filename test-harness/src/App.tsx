import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  createFaceAuthSDK,
  isFaceAuthApiError,
  type CapturePhase,
  type FaceAuthSDK,
  type MendixAuthenticateResult,
  type RegisterResult,
} from "@face-auth/sdk";
import { BRAND, BRAND_DERIVED } from "@face-auth/sdk/ui/brandTheme";

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
    "Enter Employee ID and tap Authenticate. If not enrolled, SDK shows Employee Register or Admin Kiosk Login.",
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

      if (outcome.outcome === "registered") {
        setRegisterResult(outcome.registration);
        setStatus(
          `${outcome.registration.message} (requestId: ${outcome.registration.requestId}, status: ${outcome.registration.status})`,
        );
        return;
      }

      if (outcome.outcome === "admin_kiosk_session_completed") {
        setStatus(
          "Admin kiosk session ended — workers enrolled at kiosk are ACTIVE immediately.",
        );
        return;
      }
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
          Mendix: Employee ID + Authenticate only. If not enrolled, SDK opens a
          choice overlay — Employee Register (Path A, pending approval) or Admin
          Kiosk Login (Path B, plant admin enrolls workers with fresh capture).
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
} else if (outcome.outcome === "admin_kiosk_session_completed") {
  // Path B — admin finished batch enroll at kiosk
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
    fontFamily: BRAND_DERIVED.fontFamily,
    background: `radial-gradient(circle at top left, ${BRAND_DERIVED.primaryTint} 0%, ${BRAND.background} 45%, ${BRAND.border} 100%)`,
    color: BRAND.text,
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
    color: BRAND.primary,
    fontWeight: 600,
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
    fontWeight: 650,
    color: BRAND.text,
  },
  copy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: BRAND_DERIVED.textMuted,
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
    color: BRAND.text,
  },
  hint: {
    fontWeight: 400,
    color: BRAND_DERIVED.textMuted,
  },
  input: {
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 16,
    background: BRAND_DERIVED.panel,
    color: BRAND.text,
  },
  primary: {
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    background: BRAND.primary,
    color: "#fff",
  },
  meta: {
    margin: 0,
    fontSize: 12,
    color: BRAND_DERIVED.textMuted,
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
    background: BRAND_DERIVED.primaryTint,
    border: `1px solid ${BRAND.primary}`,
    color: BRAND_DERIVED.primaryHover,
  },
  resultDenied: {
    background: "#fdecea",
    border: "1px solid #f5a8a0",
    color: "#8a1f17",
  },
  resultPending: {
    background: BRAND_DERIVED.secondaryTint,
    border: `1px solid ${BRAND.secondary}`,
    color: "#7a5c00",
  },
  status: {
    margin: 0,
    fontSize: 14,
    color: BRAND_DERIVED.textMuted,
    minHeight: 40,
  },
  integrationBox: {
    marginTop: 4,
    padding: "12px 14px",
    borderRadius: 8,
    background: BRAND.background,
    border: `1px solid ${BRAND.border}`,
  },
  integrationTitle: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: BRAND_DERIVED.textMuted,
  },
  integrationCode: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: "auto",
    fontFamily: "ui-monospace, monospace",
    color: BRAND.text,
  },
};
