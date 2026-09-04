import { useEffect, useState } from "react";

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

export type AuditEventDialogProps = {
  item: AuditLogItem;
  token: string;
  allowFace: boolean;
  onClose: () => void;
};

export function AuditEventDialog({
  item,
  token,
  allowFace,
  onClose,
}: AuditEventDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const showFace = allowFace && canShowFace(item.action) && Boolean(item.targetId);
  const employeeId = metaString(item.metadata, "employee_id");
  const fullName = metaString(item.metadata, "submitted_full_name");
  const reason = metaString(item.metadata, "reason");
  const imageDeleted = item.metadata?.image_deleted === true;

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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-text/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-event-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-2xl"
      >
        <h3 id="audit-event-title" className="text-lg font-semibold text-text">
          {auditActionLabel(item.action)}
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {formatCapturedAt(item.createdAt)}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Actor</dt>
            <dd className="font-medium text-text">{item.actorId ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Subject</dt>
            <dd className="font-medium text-text">{auditSubject(item)}</dd>
          </div>
          {employeeId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Employee ID</dt>
              <dd className="font-medium text-text">{employeeId}</dd>
            </div>
          ) : null}
          {fullName ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Name</dt>
              <dd className="font-medium text-text">{fullName}</dd>
            </div>
          ) : null}
          {reason ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Reason</dt>
              <dd className="max-w-[60%] text-right font-medium text-text">
                {reason}
              </dd>
            </div>
          ) : null}
          {item.action === "REJECT" && imageDeleted ? (
            <p className="pt-1 text-xs text-text-muted">
              Face photo was removed on reject (text audit only).
            </p>
          ) : null}
        </dl>

        {showFace ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background">
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
                className="mx-auto max-h-72 w-full object-contain"
              />
            ) : null}
          </div>
        ) : null}

        {!allowFace && canShowFace(item.action) ? (
          <p className="mt-3 text-xs text-text-muted">
            You do not have permission to view enrollment photos.
          </p>
        ) : null}

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
