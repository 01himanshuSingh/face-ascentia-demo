import { useEffect, useId, useState } from "react";

import {
  fetchRegistrationImage,
  formatCapturedAt,
  type AuditLogItem,
} from "../../api/adminApi";
import { auditActionLabel, auditSubject } from "./AuditLogTable";

function metaString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }
  const value = metadata[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return null;
}

function canShowFace(action: string): boolean {
  return action === "APPROVE" || action === "ADMIN_KIOSK_ENROLL";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-0.5 border-b border-border/60 py-3 last:border-b-0 sm:flex sm:justify-between sm:gap-4 sm:border-0 sm:py-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted sm:text-sm sm:normal-case sm:tracking-normal sm:font-normal">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-text sm:max-w-[60%] sm:text-right">
        {value}
      </dd>
    </div>
  );
}

export type AuditEventDialogProps = {
  item: AuditLogItem;
  token: string;
  allowFace: boolean;
  onClose: () => void;
};

/**
 * Desktop: centered dialog. Mobile (&lt; md): bottom sheet sliding up.
 */
export function AuditEventDialog({
  item,
  token,
  allowFace,
  onClose,
}: AuditEventDialogProps) {
  const titleId = useId();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const showFace = allowFace && canShowFace(item.action) && Boolean(item.targetId);
  const employeeId = metaString(item.metadata, "employee_id");
  const fullName = metaString(item.metadata, "submitted_full_name");
  const reason = metaString(item.metadata, "reason");
  const imageDeleted = item.metadata?.image_deleted === true;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!showFace || !item.targetId) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);

    void fetchRegistrationImage(token, item.targetId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setImageError("Photo not available.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImageLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [item.targetId, showFace, token]);

  const detailBody = (
    <>
      <dl className="mt-1 space-y-0 sm:mt-4 sm:space-y-2">
        <DetailRow label="Actor" value={item.actorId ?? "—"} />
        {item.actorRole ? (
          <DetailRow
            label="Role"
            value={item.actorRole.replace(/_/g, " ")}
          />
        ) : null}
        <DetailRow label="Subject" value={auditSubject(item)} />
        {employeeId ? (
          <DetailRow label="Employee ID" value={employeeId} />
        ) : null}
        {fullName ? <DetailRow label="Name" value={fullName} /> : null}
        {reason ? <DetailRow label="Reason" value={reason} /> : null}
        {item.action === "REJECT" && imageDeleted ? (
          <p className="pt-2 text-xs text-text-muted">
            Face photo was removed on reject (text audit only).
          </p>
        ) : null}
      </dl>

      {showFace ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background">
          {imageLoading ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              Loading photo…
            </p>
          ) : null}
          {imageError ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              {imageError}
            </p>
          ) : null}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Enrollment photo for ${employeeId ?? item.targetId}`}
              className="mx-auto max-h-56 w-full object-contain sm:max-h-72"
            />
          ) : null}
        </div>
      ) : null}

      {!allowFace && canShowFace(item.action) ? (
        <p className="mt-3 text-xs text-text-muted">
          You do not have permission to view enrollment photos.
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close audit details"
        className={`absolute inset-0 bg-text/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Mobile bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-[1.35rem] border border-border border-b-0 bg-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 flex-col items-center px-4 pt-3 pb-2">
          <div
            className="mb-3 h-1 w-10 rounded-full bg-border"
            aria-hidden
          />
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                id={titleId}
                className="text-base font-semibold leading-snug text-text"
              >
                {auditActionLabel(item.action)}
              </h3>
              <p className="mt-0.5 text-xs text-text-muted">
                {formatCapturedAt(item.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-lg leading-none text-text-muted"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {detailBody}
        </div>
      </div>

      {/* Desktop centered dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${titleId}-desktop`}
        className={`relative z-10 hidden w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl transition duration-200 md:block ${
          entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <h3
          id={`${titleId}-desktop`}
          className="text-lg font-semibold text-text"
        >
          {auditActionLabel(item.action)}
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {formatCapturedAt(item.createdAt)}
        </p>

        {detailBody}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text transition hover:bg-background"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
