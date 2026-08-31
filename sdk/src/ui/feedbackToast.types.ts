/** SDK feedback toast — Mendix-safe operator messages (not shown on Mendix page). */

export type SdkFeedbackVariant = "success" | "warning" | "error" | "info";

export type SdkFeedbackDetailRow = {
  label: string;
  value: string;
};

export type SdkFeedbackPayload = {
  variant: SdkFeedbackVariant;
  title: string;
  message: string;
  /** Machine code — auth, register, capture, network, etc. */
  code?: string;
  details?: SdkFeedbackDetailRow[];
};

export type SdkFeedbackToastOptions = {
  /** Auto-dismiss ms. 0 = stay until user dismisses. Default 5500. */
  durationMs?: number;
};
