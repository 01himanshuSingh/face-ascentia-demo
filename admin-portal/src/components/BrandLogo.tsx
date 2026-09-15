import clsx from "clsx";

/** Full wordmark — login and expanded chrome. */
export const BRAND_LOGO_SRC = "/brand/ascentia-labs-logo.png";
/** Chain mark only — collapsed rail and tight headers. */
export const BRAND_MARK_SRC = "/brand/ascentia-labs-mark.png";

export const BRAND_NAME = "Ascentia Labs";

export type BrandLogoProps = {
  /** Visual scale of the mark */
  size?: "sm" | "md" | "lg";
  /** Full lockup vs icon-only (collapsed sidebar / compact header) */
  variant?: "lockup" | "mark";
  /** Stacked (login) vs compact row (header) */
  layout?: "stacked" | "inline";
  /** Horizontal alignment for stacked layout */
  align?: "center" | "start";
  className?: string;
  /** Optional product line under / beside the mark */
  productLabel?: string;
};

/**
 * Wide lockup (~6:1) must be width-capped, not height-capped, or it overflows
 * the login card and sidebar on mobile. Mark is near-square — height is fine.
 */
const lockupClass = {
  sm: "h-auto w-full max-h-8 max-w-[10rem] sm:max-h-9 sm:max-w-[11.5rem]",
  md: "h-auto w-full max-h-9 max-w-full sm:max-h-10 lg:max-h-11",
  lg: "h-auto w-full max-h-10 max-w-full sm:max-h-12 md:max-h-14",
} as const;

const markClass = {
  sm: "h-7 w-auto sm:h-8",
  md: "h-8 w-auto 2xl:h-9",
  lg: "h-10 w-auto sm:h-11",
} as const;

/**
 * Ascentia Labs brand — login hero and dashboard chrome.
 * Assets: public/brand/ascentia-labs-logo.png + ascentia-labs-mark.png
 */
export function BrandLogo({
  size = "md",
  variant = "lockup",
  layout = "stacked",
  align = "center",
  className,
  productLabel,
}: BrandLogoProps) {
  const isMark = variant === "mark";
  const src = isMark ? BRAND_MARK_SRC : BRAND_LOGO_SRC;
  const imgClass = clsx(
    "object-contain",
    isMark ? markClass[size] : lockupClass[size],
    !isMark && align === "start" && "object-left",
  );

  const image = (
    <img
      src={src}
      alt={BRAND_NAME}
      width={isMark ? 98 : 506}
      height={isMark ? 80 : 84}
      decoding="async"
      className={clsx(imgClass, isMark ? "shrink-0" : "min-w-0")}
    />
  );

  if (layout === "inline") {
    return (
      <div className={clsx("flex min-w-0 items-center gap-2 sm:gap-3", className)}>
        {image}
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
        "flex min-w-0 flex-col",
        align === "start" ? "items-start text-left" : "items-center text-center",
        !isMark && "w-full",
        className,
      )}
    >
      {image}
      {productLabel ? (
        <p className="mt-2 text-xs font-medium tracking-wide text-text-muted sm:mt-3 sm:text-sm">
          {productLabel}
        </p>
      ) : null}
    </div>
  );
}
