import { useState, type CSSProperties, type FormEvent, type ReactElement } from "react";

import type { PlantListItem } from "../types/registration.types";

export interface RegisterSubmitPayload {
  employeeId: string;
  plantId: string;
  fullName: string;
}

export interface RegisterOverlayProps {
  open: boolean;
  plants: PlantListItem[];
  defaultEmployeeId?: string;
  defaultFullName?: string;
  defaultPlantId?: string;
  subtitle?: string;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: RegisterSubmitPayload) => void;
  onCancel?: () => void;
}

/**
 * Registration-first Path A — Plant + Employee ID + Full name (no camera).
 * Face JPEG is reused from the prior authenticate capture.
 */
export function RegisterOverlay({
  open,
  plants,
  defaultEmployeeId = "",
  defaultFullName = "",
  defaultPlantId = "",
  subtitle = "Select your plant and confirm your details. Your photo from login will be used.",
  busy = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: RegisterOverlayProps): ReactElement | null {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [fullName, setFullName] = useState(defaultFullName);
  const [plantId, setPlantId] = useState(defaultPlantId);

  if (!open) {
    return null;
  }

  const canSubmit =
    employeeId.trim().length > 0 &&
    fullName.trim().length > 0 &&
    plantId.trim().length > 0 &&
    !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      employeeId: employeeId.trim(),
      plantId: plantId.trim(),
      fullName: fullName.trim(),
    });
  };

  return (
    <div style={styles.root} role="dialog" aria-modal="true" aria-labelledby="register-title">
      <div style={styles.panel}>
        <header style={styles.header}>
          <h2 id="register-title" style={styles.title}>
            Register for face login
          </h2>
          {onCancel ? (
            <button type="button" style={styles.closeButton} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          ) : null}
        </header>

        <p style={styles.subtitle}>{subtitle}</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="face-auth-register-plant">
            Plant
          </label>
          <select
            id="face-auth-register-plant"
            style={styles.input}
            value={plantId}
            onChange={(event) => setPlantId(event.target.value)}
            disabled={busy || plants.length === 0}
            required
          >
            <option value="">Select plant…</option>
            {plants.map((plant) => (
              <option key={plant.plantId} value={plant.plantId}>
                {plant.plantName} ({plant.plantCode})
              </option>
            ))}
          </select>

          <label style={styles.label} htmlFor="face-auth-register-employee-id">
            Employee ID
          </label>
          <input
            id="face-auth-register-employee-id"
            style={styles.input}
            type="text"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            autoComplete="off"
            disabled={busy}
            required
          />

          <label style={styles.label} htmlFor="face-auth-register-full-name">
            Full name
          </label>
          <input
            id="face-auth-register-full-name"
            style={styles.input}
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            disabled={busy}
            required
          />

          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

          <button type="submit" style={styles.submitButton} disabled={!canSubmit}>
            {busy ? "Submitting…" : "Submit registration"}
          </button>
        </form>

        <p style={styles.footer}>
          Your plant admin will verify against HR records before approval.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.72)",
    padding: 16,
    boxSizing: "border-box",
  },
  panel: {
    width: "min(420px, 100%)",
    background: "#111827",
    color: "#f9fafb",
    borderRadius: 12,
    padding: 20,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
  },
  closeButton: {
    border: "1px solid #4b5563",
    background: "#1f2937",
    color: "#f9fafb",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: "#d1d5db",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#e5e7eb",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #4b5563",
    background: "#0f172a",
    color: "#f9fafb",
    padding: "10px 12px",
    fontSize: 16,
  },
  submitButton: {
    marginTop: 4,
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    margin: 0,
    fontSize: 14,
    color: "#fca5a5",
  },
  footer: {
    margin: 0,
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.4,
  },
};
