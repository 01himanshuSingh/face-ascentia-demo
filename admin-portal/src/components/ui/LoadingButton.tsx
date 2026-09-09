import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonSpinnerProps = {
  className?: string;
  /** Light spinner for dark/primary buttons; dark for light buttons. */
  tone?: "light" | "dark" | "danger";
};

/**
 * Compact inline spinner for action buttons waiting on API responses.
 */
export function ButtonSpinner({
  className,
  tone = "light",
}: ButtonSpinnerProps) {
  return (
    <span
      className={clsx(
        "inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2",
        tone === "light" && "border-white/35 border-t-white",
        tone === "dark" && "border-primary/25 border-t-primary",
        tone === "danger" && "border-red-200 border-t-red-700",
        className,
      )}
      aria-hidden
    />
  );
}

export type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  /** Shown while loading; defaults to children. */
  loadingLabel?: ReactNode;
  spinnerTone?: ButtonSpinnerProps["tone"];
};

/**
 * Primary action control: disables + shows spinner while an API call is in flight.
 */
export function LoadingButton({
  loading = false,
  loadingLabel,
  spinnerTone = "light",
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {loading ? <ButtonSpinner tone={spinnerTone} /> : null}
      <span>{loading ? (loadingLabel ?? children) : children}</span>
    </button>
  );
}
