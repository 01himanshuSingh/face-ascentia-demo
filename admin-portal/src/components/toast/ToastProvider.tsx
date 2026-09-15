import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clsx } from "clsx";

export type ToastTone = "error" | "success" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
};

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  error: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5200;

function toneStyles(tone: ToastTone): string {
  if (tone === "success") {
    return "border-primary/30 bg-primary/15 text-primary";
  }
  if (tone === "info") {
    return "border-primary/25 bg-secondary text-text";
  }
  return "border-red-500/40 bg-red-950/40 text-red-300";
}

function toneLabel(tone: ToastTone): string {
  if (tone === "success") {
    return "Success";
  }
  if (tone === "info") {
    return "Notice";
  }
  return "Error";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const tone = toast.tone ?? "info";
      const durationMs = toast.durationMs ?? DEFAULT_DURATION_MS;

      setToasts((current) => [
        ...current,
        {
          id,
          title: toast.title,
          description: toast.description,
          tone,
          durationMs,
        },
      ]);

      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      error: (title, description) =>
        push({ title, description, tone: "error" }),
      success: (title, description) =>
        push({ title, description, tone: "success" }),
      info: (title, description) => push({ title, description, tone: "info" }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-stretch gap-2 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md sm:items-end"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={clsx(
              "pointer-events-auto w-full rounded-xl border px-4 py-3 shadow-lg shadow-text/10 backdrop-blur transition",
              toneStyles(toast.tone),
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
                  {toneLabel(toast.tone)}
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-snug">
                  {toast.title}
                </p>
                {toast.description ? (
                  <p className="mt-1 text-sm leading-relaxed opacity-90">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium opacity-70 transition hover:opacity-100"
                aria-label="Dismiss"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
