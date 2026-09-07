import clsx from "clsx";

const LOGO_SRC = "/brand/vardhman-logo.png";

export type BrandLogoProps = {
  /** Visual scale of the mark */
  size?: "sm" | "md" | "lg";
  /** Stacked (login) vs compact row (header) */
  layout?: "stacked" | "inline";
  /** Horizontal alignment for stacked layout */
  align?: "center" | "start";
  className?: string;
  /** Optional product line under / beside the mark */
  productLabel?: string;
};

const sizeClass = {
  sm: "h-9 w-auto",
  md: "h-12 w-auto",
  lg: "h-[4.5rem] w-auto sm:h-[5.25rem]",
} as const;

/**
 * Vardhmān brand mark — login hero and dashboard chrome.
 * Served from public/brand/vardhman-logo.png
 */
export function BrandLogo({
  size = "md",
  layout = "stacked",
  align = "center",
  className,
  productLabel,
}: BrandLogoProps) {
  if (layout === "inline") {
    return (
      <div className={clsx("flex min-w-0 items-center gap-3", className)}>
        <img
          src={LOGO_SRC}
          alt="Vardhmān"
          className={clsx(
            sizeClass[size],
            "shrink-0 object-contain object-left",
          )}
        />
        {productLabel ? (
          <p className="truncate text-sm font-semibold tracking-tight text-text">
            {productLabel}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex flex-col",
        align === "start" ? "items-start text-left" : "items-center text-center",
        className,
      )}
    >
      <img
        src={LOGO_SRC}
        alt="Vardhmān Logo"
        className={clsx(sizeClass[size], "object-contain")}
      />
      {productLabel ? (
        <p className="mt-3 text-sm font-medium tracking-wide text-text-muted">
          {productLabel}
        </p>
      ) : null}
    </div>
  );
}
