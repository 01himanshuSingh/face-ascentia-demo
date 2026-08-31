import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createFaceAuthClient,
  FaceAuthApiError,
  isFaceAuthApiError,
  type FaceAuthClient,
} from "../api/FaceAuthClient";
import type { CameraStartOptions } from "../camera/camera.types";
import { CameraOverlay } from "../components/CameraOverlay";
import { RegisterOverlay } from "../components/RegisterOverlay";
import {
  feedbackFromApiError,
  feedbackFromAuthenticateResult,
  feedbackFromCaptureFailure,
  feedbackFromRegisterResult,
  feedbackFromUnknownError,
  feedbackRegistrationCancelled,
} from "../ui/feedbackToastMappers";
import {
  dismissSdkFeedbackToast,
  destroySdkFeedbackToastHost,
  showSdkFeedbackToast,
} from "../ui/showSdkFeedbackToast";
import type { SdkFeedbackPayload } from "../ui/feedbackToast.types";
import {
  AuthErrorCode,
  type CapturePhase,
  type FaceCaptureFailure,
  type FaceCaptureResult,
  type MendixAuthenticateResult,
} from "../types/auth.types";
import type { PlantListItem, RegisterResult } from "../types/registration.types";
import type { RegisterSubmitPayload } from "../components/RegisterOverlay";

/**
 * Public configuration for the Face Authentication SDK (npm → Mendix team).
 *
 * Deployment split:
 * - This SDK runs in the Mendix / kiosk Chrome page
 * - Face matching / SFace / DB run on a separate Debian backend (apiBaseUrl)
 */
export interface FaceAuthSDKConfig {
  /**
   * Debian face-auth API origin, e.g. https://face-auth.customer.local
   * Required for authenticate() and register().
   */
  apiBaseUrl?: string;

  /** Optional fetch override (tests / restricted Mendix environments). */
  fetchFn?: typeof fetch;

  /** POST /authenticate and /register timeout in ms. Default 30_000. */
  authTimeoutMs?: number;

  camera?: CameraStartOptions;
  title?: string;
  faceTimeoutMs?: number;
  blinkTimeoutMs?: number;
  mountNode?: HTMLElement;
  onCameraClose?: () => void;
  onPhaseChange?: (phase: CapturePhase) => void;

  /**
   * Operator feedback toast (scores, thresholds, capture/API errors).
   * Mendix page stays minimal — SDK shows details here. Default true.
   */
  showFeedbackToast?: boolean;

  /** Auto-dismiss for feedback toast. Default 5500ms. Set 0 to require manual dismiss. */
  feedbackToastDurationMs?: number;
}

export interface FaceAuthSDKCameraSession {
  readonly isOpen: boolean;
}

/** Path A outcome when using authenticateOrRegister(). */
export type AuthenticateOrRegisterOutcome =
  | {
      outcome: "authenticated";
      employeeId: string;
      authenticated: true;
    }
  | {
      outcome: "denied";
      employeeId: string;
      authenticated: false;
    }
  | {
      outcome: "registered";
      registration: RegisterResult;
    };

/**
 * Imperative facade shipped to the Mendix team as an npm package.
 *
 * Mendix login page (Employee ID + Authenticate only):
 *   const sdk = createFaceAuthSDK({ apiBaseUrl: "https://..." });
 *
 * Option A — Mendix handles ENROLLMENT_NOT_FOUND:
 *   try { await sdk.authenticate(id); } catch (e) {
 *     if (e.code === "ENROLLMENT_NOT_FOUND") await sdk.promptRegisterAndSubmit(id);
 *   }
 *
 * Option B — SDK handles not-enrolled + register UI:
 *   await sdk.authenticateOrRegister(id);
 *
 * Mendix session/login remains Mendix-owned after authenticated=true.
 */
export class FaceAuthSDK {
  private readonly config: FaceAuthSDKConfig;
  private hostNode: HTMLElement | null = null;
  private root: Root | null = null;
  private cameraOpen = false;
  private ownedHost = false;
  private pipelineEnabled = false;
  private authClient: FaceAuthClient | null = null;

  /** JPEG from the most recent authenticate capture — reused for register(). */
  private lastCapture: FaceCaptureResult | null = null;
  /** Correlates auth + register when sent to backend (optional). */
  private lastSessionId: string | null = null;

  private registerOverlayOpen = false;
  private registerDefaultEmployeeId = "";
  private registerPlants: PlantListItem[] = [];
  private registerBusy = false;
  private registerError: string | null = null;

  private captureWaiters: {
    resolve: (result: FaceCaptureResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  private registerFlowWaiters: {
    resolve: (result: RegisterResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(config: FaceAuthSDKConfig = {}) {
    this.config = config;
  }

  getCameraSession(): FaceAuthSDKCameraSession {
    return { isOpen: this.cameraOpen };
  }

  /** Last kiosk capture (for harness / register reuse). Null after successful register. */
  getLastCapture(): FaceCaptureResult | null {
    return this.lastCapture;
  }

  /**
   * Mendix authenticate — one camera capture + POST /authenticate.
   *
   * Stores the capture in memory for a follow-up register() on ENROLLMENT_NOT_FOUND.
   * Wrong face → authenticated=false (not thrown).
   */
  async authenticate(
    employeeId: string,
    capture?: FaceCaptureResult,
  ): Promise<MendixAuthenticateResult> {
    const normalizedId = employeeId.trim();
    if (!normalizedId) {
      throw new Error("FaceAuthSDK.authenticate() requires a non-empty employeeId.");
    }

    const frame = capture ?? (await this.captureFace());
    this.storeCaptureSession(frame);

    try {
      const apiResult = await this.getAuthClient().authenticate({
        employeeId: normalizedId,
        image: frame,
      });

      this.showFeedback(feedbackFromAuthenticateResult(apiResult));

      if (apiResult.authenticated) {
        this.clearCaptureSession();
      }

      return {
        employeeId: apiResult.employeeId,
        authenticated: apiResult.authenticated,
      };
    } catch (error) {
      if (isFaceAuthApiError(error) && this.isRegisterEligibleAuthError(error.code)) {
        this.showFeedback(feedbackFromApiError(error));
        throw error;
      }
      this.showFeedback(feedbackFromUnknownError(error));
      this.clearCaptureSession();
      throw error;
    }
  }

  private isRegisterEligibleAuthError(
    code: string,
  ): code is typeof AuthErrorCode.ENROLLMENT_NOT_FOUND | typeof AuthErrorCode.EMPLOYEE_NOT_FOUND {
    return (
      code === AuthErrorCode.ENROLLMENT_NOT_FOUND ||
      code === AuthErrorCode.EMPLOYEE_NOT_FOUND
    );
  }

  /**
   * Path A register — POST /register with reused auth JPEG (no camera).
   *
   * @param capture Override lastCapture (harness only); production uses auth capture.
   */
  async register(
    payload: RegisterSubmitPayload,
    capture?: FaceCaptureResult,
  ): Promise<RegisterResult> {
    const normalizedId = payload.employeeId.trim();
    const plantId = payload.plantId.trim();
    const fullName = payload.fullName.trim();
    if (!normalizedId || !plantId || !fullName) {
      throw new Error(
        "FaceAuthSDK.register() requires employeeId, plantId, and fullName.",
      );
    }

    const frame = capture ?? this.lastCapture;
    if (!frame) {
      throw new Error(
        "No face capture available for register(). Complete authenticate() first.",
      );
    }

    try {
      const result = await this.getAuthClient().register({
        employeeId: normalizedId,
        plantId,
        fullName,
        image: frame,
        sessionId: this.lastSessionId ?? undefined,
      });

      this.showFeedback(feedbackFromRegisterResult(result));
      this.clearCaptureSession();
      return result;
    } catch (error) {
      this.showFeedback(
        isFaceAuthApiError(error)
          ? feedbackFromApiError(error)
          : feedbackFromUnknownError(error),
      );
      throw error;
    }
  }

  /**
   * Registration-first Register overlay — Plant + Employee ID + Full name.
   */
  async promptRegisterAndSubmit(defaultEmployeeId: string): Promise<RegisterResult> {
    if (!this.lastCapture) {
      throw new Error(
        "No face capture available. authenticate() must run first.",
      );
    }

    if (typeof document === "undefined") {
      throw new Error("FaceAuthSDK.promptRegisterAndSubmit() requires a browser environment.");
    }

    const { plants } = await this.getAuthClient().listPlants();
    this.registerPlants = plants;

    this.ensureMounted();
    this.registerDefaultEmployeeId = defaultEmployeeId.trim();
    this.registerError = null;
    this.registerBusy = false;
    this.registerOverlayOpen = true;
    this.render();

    return new Promise<RegisterResult>((resolve, reject) => {
      this.registerFlowWaiters = { resolve, reject };
    });
  }

  /**
   * Convenience: authenticate → on not enrolled open Register UI → PENDING request.
   * Mendix login session is still only created when outcome=authenticated.
   */
  async authenticateOrRegister(
    employeeId: string,
  ): Promise<AuthenticateOrRegisterOutcome> {
    const normalizedId = employeeId.trim();
    if (!normalizedId) {
      throw new Error("FaceAuthSDK.authenticateOrRegister() requires a non-empty employeeId.");
    }

    try {
      const auth = await this.authenticate(normalizedId);
      if (auth.authenticated) {
        return {
          outcome: "authenticated",
          employeeId: auth.employeeId,
          authenticated: true,
        };
      }
      return {
        outcome: "denied",
        employeeId: auth.employeeId,
        authenticated: false,
      };
    } catch (error) {
      if (isFaceAuthApiError(error) && this.isRegisterEligibleAuthError(error.code)) {
        const registration = await this.promptRegisterAndSubmit(normalizedId);
        return { outcome: "registered", registration };
      }
      throw error;
    }
  }

  /**
   * Browser capture only — returns the best JPEG for manual/backend testing.
   */
  async captureFace(): Promise<FaceCaptureResult> {
    if (typeof document === "undefined") {
      throw new Error("FaceAuthSDK.captureFace() requires a browser environment.");
    }
    if (this.captureWaiters) {
      throw new Error("A capture session is already in progress.");
    }

    this.ensureMounted();
    this.pipelineEnabled = true;
    this.cameraOpen = true;

    return new Promise<FaceCaptureResult>((resolve, reject) => {
      this.captureWaiters = { resolve, reject };
      this.render();
    });
  }

  async openCamera(): Promise<FaceAuthSDKCameraSession> {
    if (typeof document === "undefined") {
      throw new Error("FaceAuthSDK.openCamera() requires a browser environment.");
    }
    if (this.cameraOpen) {
      return this.getCameraSession();
    }

    this.ensureMounted();
    this.pipelineEnabled = false;
    this.cameraOpen = true;
    this.render();
    return this.getCameraSession();
  }

  async closeCamera(): Promise<FaceAuthSDKCameraSession> {
    if (!this.cameraOpen) {
      return this.getCameraSession();
    }

    this.rejectCapture(
      Object.assign(new Error("Capture cancelled."), {
        code: "CANCELLED",
      }),
    );
    this.pipelineEnabled = false;
    this.cameraOpen = false;
    this.render();
    this.config.onCameraClose?.();
    return this.getCameraSession();
  }

  async destroy(): Promise<void> {
    dismissSdkFeedbackToast();
    this.rejectCapture(
      Object.assign(new Error("SDK destroyed."), { code: "CANCELLED" }),
    );
    this.rejectRegisterFlow(
      Object.assign(new Error("SDK destroyed."), { code: "CANCELLED" }),
    );
    this.pipelineEnabled = false;
    this.cameraOpen = false;
    this.registerOverlayOpen = false;
    this.authClient = null;
    this.clearCaptureSession();

    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    if (this.ownedHost && this.hostNode?.parentNode) {
      this.hostNode.parentNode.removeChild(this.hostNode);
    }

    this.hostNode = null;
    this.ownedHost = false;
    destroySdkFeedbackToastHost();
  }

  private showFeedback(payload: SdkFeedbackPayload): void {
    if (this.config.showFeedbackToast === false) {
      return;
    }
    showSdkFeedbackToast(payload, {
      durationMs: this.config.feedbackToastDurationMs,
    });
  }

  private storeCaptureSession(frame: FaceCaptureResult): void {
    this.lastCapture = frame;
    this.lastSessionId = this.createSessionId();
  }

  private clearCaptureSession(): void {
    this.lastCapture = null;
    this.lastSessionId = null;
  }

  private createSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `capture-${Date.now()}`;
  }

  private getAuthClient(): FaceAuthClient {
    const base = this.config.apiBaseUrl?.trim();
    if (!base) {
      throw new FaceAuthApiError("apiBaseUrl is required for FaceAuthSDK API calls.", {
        httpStatus: 0,
        code: "API_NOT_CONFIGURED",
        detail: "Pass apiBaseUrl to createFaceAuthSDK({ apiBaseUrl: '...' }).",
      });
    }

    if (!this.authClient) {
      this.authClient = createFaceAuthClient({
        apiBaseUrl: base,
        fetchFn: this.config.fetchFn,
        timeoutMs: this.config.authTimeoutMs,
      });
    }

    return this.authClient;
  }

  private ensureMounted(): void {
    if (this.root) {
      return;
    }

    if (this.config.mountNode) {
      this.hostNode = this.config.mountNode;
      this.ownedHost = false;
    } else {
      const node = document.createElement("div");
      node.setAttribute("data-face-auth-sdk-root", "true");
      document.body.appendChild(node);
      this.hostNode = node;
      this.ownedHost = true;
    }

    this.root = createRoot(this.hostNode);
  }

  private finishCaptureSuccess(result: FaceCaptureResult): void {
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    waiters?.resolve(result);
  }

  private finishCaptureFailure(failure: FaceCaptureFailure): void {
    this.showFeedback(feedbackFromCaptureFailure(failure));
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    if (waiters) {
      const error = Object.assign(new Error(failure.message), {
        code: failure.code,
        phase: failure.phase,
      });
      waiters.reject(error);
    }
  }

  private rejectCapture(error: Error): void {
    const code = (error as Error & { code?: string }).code;
    if (code === "CANCELLED") {
      this.showFeedback(feedbackFromCaptureFailure({
        code: "CANCELLED",
        message: error.message,
        phase: "cancelled",
      }));
    }
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    waiters?.reject(error);
  }

  private rejectRegisterFlow(error: Error): void {
    const waiters = this.registerFlowWaiters;
    this.registerFlowWaiters = null;
    this.registerOverlayOpen = false;
    this.registerBusy = false;
    this.registerError = null;
    waiters?.reject(error);
  }

  private finishRegisterFlowSuccess(result: RegisterResult): void {
    const waiters = this.registerFlowWaiters;
    this.registerFlowWaiters = null;
    this.registerOverlayOpen = false;
    this.registerBusy = false;
    this.registerError = null;
    waiters?.resolve(result);
  }

  private handleRegisterCancel(): void {
    // Mendix only shows Employee ID + Authenticate — discard auth JPEG so the
    // next tap must run camera again (no silent reuse of a cancelled capture).
    this.clearCaptureSession();
    this.cameraOpen = false;
    this.pipelineEnabled = false;
    this.showFeedback(feedbackRegistrationCancelled());
    this.rejectRegisterFlow(
      Object.assign(new Error("Registration cancelled."), { code: "CANCELLED" }),
    );
    this.render();
  }

  private async handleRegisterSubmit(payload: RegisterSubmitPayload): Promise<void> {
    this.registerBusy = true;
    this.registerError = null;
    this.render();

    try {
      const result = await this.register(payload);
      this.finishRegisterFlowSuccess(result);
      this.render();
    } catch (error) {
      this.registerBusy = false;
      if (isFaceAuthApiError(error)) {
        this.registerError = error.detail;
      } else if (error instanceof Error) {
        this.registerError = error.message;
      } else {
        this.registerError = "Registration failed.";
      }
      this.render();
    }
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    if (this.registerOverlayOpen) {
      this.root.render(
        createElement(RegisterOverlay, {
          key: this.registerDefaultEmployeeId || "register",
          open: true,
          plants: this.registerPlants,
          defaultEmployeeId: this.registerDefaultEmployeeId,
          busy: this.registerBusy,
          errorMessage: this.registerError,
          onSubmit: (payload) => {
            void this.handleRegisterSubmit(payload);
          },
          onCancel: () => {
            this.handleRegisterCancel();
          },
        }),
      );
      return;
    }

    this.root.render(
      createElement(CameraOverlay, {
        open: this.cameraOpen,
        startOptions: this.config.camera,
        title: this.config.title,
        enableCapturePipeline: this.pipelineEnabled && this.cameraOpen,
        faceTimeoutMs: this.config.faceTimeoutMs,
        blinkTimeoutMs: this.config.blinkTimeoutMs,
        onPhaseChange: this.config.onPhaseChange,
        onCaptureComplete: (result) => {
          this.finishCaptureSuccess(result);
        },
        onCaptureError: (failure) => {
          this.finishCaptureFailure(failure);
        },
        onClose: () => {
          this.cameraOpen = false;
          this.pipelineEnabled = false;
          this.render();
          this.config.onCameraClose?.();
        },
      }),
    );
  }
}

export function createFaceAuthSDK(config: FaceAuthSDKConfig = {}): FaceAuthSDK {
  return new FaceAuthSDK(config);
}

export type { RegisterResult };
