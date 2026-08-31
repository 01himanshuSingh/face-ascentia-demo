import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthScoreToast } from "../components/AuthScoreToast";
import type {
  SdkFeedbackPayload,
  SdkFeedbackToastOptions,
} from "./feedbackToast.types";

const HOST_ID = "face-auth-sdk-feedback-toast-host";
const DEFAULT_DURATION_MS = 5500;

let hostNode: HTMLDivElement | null = null;
let root: Root | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHost(): HTMLDivElement {
  if (hostNode && document.body.contains(hostNode)) {
    return hostNode;
  }

  hostNode = document.createElement("div");
  hostNode.id = HOST_ID;
  hostNode.setAttribute("data-face-auth-sdk-feedback", "true");
  document.body.appendChild(hostNode);
  root = createRoot(hostNode);
  return hostNode;
}

function clearDismissTimer(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

export function dismissSdkFeedbackToast(): void {
  clearDismissTimer();
  if (root) {
    root.render(null);
  }
}

/**
 * Imperative toast — independent of Mendix DOM and SDK camera/register roots.
 * Safe for npm package: mounts once on document.body.
 */
export function showSdkFeedbackToast(
  payload: SdkFeedbackPayload,
  options: SdkFeedbackToastOptions = {},
): void {
  if (typeof document === "undefined") {
    return;
  }

  ensureHost();
  clearDismissTimer();

  const dismiss = () => {
    dismissSdkFeedbackToast();
  };

  root?.render(
    createElement(AuthScoreToast, {
      ...payload,
      onDismiss: dismiss,
    }),
  );

  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  if (durationMs > 0) {
    dismissTimer = setTimeout(dismiss, durationMs);
  }
}

export function destroySdkFeedbackToastHost(): void {
  clearDismissTimer();
  if (root) {
    root.unmount();
    root = null;
  }
  if (hostNode?.parentNode) {
    hostNode.parentNode.removeChild(hostNode);
  }
  hostNode = null;
}
