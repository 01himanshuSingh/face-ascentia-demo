import { createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createFaceAuthClient,
  FaceAuthApiError,
  isFaceAuthApiError,
  type FaceAuthClient,
} from "../api/FaceAuthClient";
import type { CameraStartOptions } from "../camera/camera.types";
import { AdminEnrollLoopOverlay } from "../components/AdminEnrollLoopOverlay";
import {
  AdminKioskLoginOverlay,
  type AdminKioskLoginSubmitPayload,
} from "../components/AdminKioskLoginOverlay";
import { CameraOverlay } from "../components/CameraOverlay";
import { EnrollmentFacePreviewOverlay } from "../components/EnrollmentFacePreviewOverlay";
import { NotEnrolledChoiceOverlay } from "../components/NotEnrolledChoiceOverlay";
import { RegisterOverlay } from "../components/RegisterOverlay";
import type { RegisterSubmitPayload } from "../components/RegisterOverlay";
import type { NotEnrolledChoice } from "../components/NotEnrolledChoiceOverlay";
import {
  feedbackAdminKioskSessionEnded,
  feedbackAdminKioskLoginSuccess,
  feedbackFromApiError,
  feedbackFromAuthenticateResult,
  feedbackFromCaptureFailure,
  feedbackFromKioskAdminApiError,
  feedbackFromKioskAdminEnroll,
  feedbackFromRegisterResult,
  feedbackFromRegistrationApiError,
  feedbackFromUnknownError,
  feedbackRegistrationCancelled,
  isCaptureRelatedErrorCode,
  userFacingErrorMessage,
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
import {
  toKioskAdminSession,
  type KioskAdminEnrollResult,
  type KioskAdminSession,
} from "../types/kioskAdmin.types";
import type { PlantListItem, RegisterResult } from "../types/registration.types";

// ---------------------------------------------------------------------------
// Public configuration
// ---------------------------------------------------------------------------

/**
 * Public configuration for the Face Authentication SDK (npm → Mendix team).
 *
 * Deployment split:
 * - SDK runs in Mendix / kiosk Chrome (camera, overlays, session UX)
 * - Debian backend (`apiBaseUrl`) owns SFace, pgvector, enrollments, audit
 */
export interface FaceAuthSDKConfig {
  /** Debian face-auth API origin, e.g. https://face-auth.customer.local */
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
  authTimeoutMs?: number;
  camera?: CameraStartOptions;
  title?: string;
  faceTimeoutMs?: number;
  blinkTimeoutMs?: number;
  mountNode?: HTMLElement;
  onCameraClose?: () => void;
  onPhaseChange?: (phase: CapturePhase) => void;
  showFeedbackToast?: boolean;
  feedbackToastDurationMs?: number;
  /** Ms to show captured face preview during enrollment (Path A + Path B). Default 1800. */
  enrollmentPreviewDurationMs?: number;
}

export interface FaceAuthSDKCameraSession {
  readonly isOpen: boolean;
}

/** Path A + Path B outcomes from authenticateOrRegister(). */
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
    }
  | {
      /** Path B admin finished batch enroll and ended kiosk session. */
      outcome: "admin_kiosk_session_completed";
    };

// ---------------------------------------------------------------------------
// Internal UI state machine (Mendix never sees these — SDK-internal only)
// ---------------------------------------------------------------------------

/**
 * SDK overlay state machine (see docs/architecture/registration-flow.md).
 *
 * ```text
 * IDLE
 *   └─ authenticate() → CAMERA → AUTH RESULT
 *        ├─ match → IDLE (Mendix login)
 *        ├─ no match → IDLE (Mendix deny)
 *        └─ not enrolled → NOT_ENROLLED_CHOICE
 *             ├─ Employee Register → REGISTER (Path A, reuse auth JPEG)
 *             └─ Admin Kiosk Login → ADMIN_LOGIN → ADMIN_ENROLL LOOP
 *                  └─ fresh capture per worker; never authenticate() again
 * ```
 */
const enum SdkUiState {
  Idle = "idle",
  /** Camera open for worker authenticate or admin fresh capture. */
  Camera = "camera",
  /** STATE 3 — two-button choice overlay. */
  NotEnrolledChoice = "not_enrolled_choice",
  /** Path A register form (reuse auth JPEG). */
  Register = "register",
  /** STATE 4 — admin operator password login. */
  AdminLogin = "admin_login",
  /** STATE 5 — batch enroll loop (camera re-opens per worker). */
  AdminEnroll = "admin_enroll",
}

/** What captureFace() is driving — determines post-capture routing. */
const enum CaptureIntent {
  Authenticate = "authenticate",
  AdminEnroll = "admin_enroll",
  Manual = "manual",
}

// ---------------------------------------------------------------------------
// FaceAuthSDK — imperative facade for Mendix
// ---------------------------------------------------------------------------

/**
 * Imperative facade shipped to the Mendix team as an npm package.
 *
 * Mendix login page stays fixed: **Employee ID + Authenticate only**.
 * All overlays, camera, Path A register, and Path B admin enroll live here.
 *
 * ```typescript
 * const sdk = createFaceAuthSDK({ apiBaseUrl: "https://..." });
 *
 * // Recommended — SDK handles not-enrolled choice + register OR admin session:
 * const outcome = await sdk.authenticateOrRegister(employeeId);
 *
 * // Advanced — Mendix handles ENROLLMENT_NOT_FOUND itself:
 * try { await sdk.authenticate(id); } catch (e) {
 *   if (e.code === "ENROLLMENT_NOT_FOUND") await sdk.promptRegisterAndSubmit(id);
 * }
 *
 * await sdk.destroy();
 * ```
 */
export class FaceAuthSDK {
  private readonly config: FaceAuthSDKConfig;

  // --- React host ---
  private hostNode: HTMLElement | null = null;
  private root: Root | null = null;
  private ownedHost = false;

  // --- API client (lazy) ---
  private authClient: FaceAuthClient | null = null;

  // --- UI state machine ---
  private uiState: SdkUiState = SdkUiState.Idle;
  private captureIntent: CaptureIntent = CaptureIntent.Manual;

  // --- Camera pipeline ---
  private cameraOpen = false;
  private pipelineEnabled = false;

  // --- Path A: auth capture reuse ---
  private lastCapture: FaceCaptureResult | null = null;
  private lastSessionId: string | null = null;

  // --- Not-enrolled choice (STATE 3) ---
  private notEnrolledEmployeeId = "";
  private notEnrolledBusy = false;
  private notEnrolledWaiters: {
    resolve: (choice: NotEnrolledChoice) => void;
    reject: (error: Error) => void;
  } | null = null;

  // --- Path A register overlay ---
  private registerDefaultEmployeeId = "";
  private registerPlants: PlantListItem[] = [];
  private registerBusy = false;
  private registerError: string | null = null;
  private registerFlowWaiters: {
    resolve: (result: RegisterResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  // --- Path B admin kiosk ---
  private adminSession: KioskAdminSession | null = null;
  private adminLoginBusy = false;
  private adminLoginError: string | null = null;
  private adminEnrollBusy = false;
  private adminEnrollError: string | null = null;
  private adminEnrollTargetId: string | null = null;
  private adminLastEnrolledId: string | null = null;
  private adminEnrollFormKey = 0;
  private adminSessionWaiters: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  // --- In-flight capture promise ---
  private captureWaiters: {
    resolve: (result: FaceCaptureResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  // --- Enrollment face preview (Path A register + Path B admin enroll) ---
  private enrollmentPreview: {
    dataUrl: string;
    caption: string;
    subtitle?: string;
  } | null = null;
  private enrollmentPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private enrollmentPreviewWaiters: {
    resolve: () => void;
  } | null = null;

  constructor(config: FaceAuthSDKConfig = {}) {
    this.config = config;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  getCameraSession(): FaceAuthSDKCameraSession {
    return { isOpen: this.cameraOpen };
  }

  getLastCapture(): FaceCaptureResult | null {
    return this.lastCapture;
  }

  /**
   * Mendix authenticate — one camera capture + POST /authenticate.
   *
   * Stores capture for Path A register reuse. Wrong face → authenticated=false.
   * Not enrolled → throws ENROLLMENT_NOT_FOUND / EMPLOYEE_NOT_FOUND (capture kept).
   */
  async authenticate(
    employeeId: string,
    capture?: FaceCaptureResult,
  ): Promise<MendixAuthenticateResult> {
    this.assertNotInAdminEnrollLoop("authenticate");

    const normalizedId = employeeId.trim();
    if (!normalizedId) {
      throw new Error("FaceAuthSDK.authenticate() requires a non-empty employeeId.");
    }

    const frame = capture ?? (await this.captureForAuthenticate());
    this.storeAuthCapture(frame);

    try {
      const apiResult = await this.getAuthClient().authenticate({
        employeeId: normalizedId,
        image: frame,
      });

      this.showFeedback(feedbackFromAuthenticateResult(apiResult));

      if (apiResult.authenticated) {
        this.clearAuthCapture();
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
      this.clearAuthCapture();
      throw error;
    }
  }

  /**
   * Path A — POST /register with reused auth JPEG (no second camera).
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
      this.clearAuthCapture();
      return result;
    } catch (error) {
      this.showFeedback(
        isFaceAuthApiError(error)
          ? feedbackFromRegistrationApiError(error)
          : feedbackFromUnknownError(error),
      );
      throw error;
    }
  }

  /**
   * Path A register overlay — Plant + Employee ID + Full name.
   */
  async promptRegisterAndSubmit(defaultEmployeeId: string): Promise<RegisterResult> {
    if (!this.lastCapture) {
      throw new Error(
        "No face capture available. authenticate() must run first.",
      );
    }

    this.assertBrowser("promptRegisterAndSubmit");

    await this.showEnrollmentPreview(this.lastCapture, {
      caption: "Enrollment photo captured",
      subtitle: "Complete your details to submit for approval",
    });

    const { plants } = await this.getAuthClient().listPlants();
    this.registerPlants = plants;
    this.registerDefaultEmployeeId = defaultEmployeeId.trim();
    this.registerError = null;
    this.registerBusy = false;
    this.transitionTo(SdkUiState.Register);
    this.render();

    return new Promise<RegisterResult>((resolve, reject) => {
      this.registerFlowWaiters = { resolve, reject };
    });
  }

  /**
   * Convenience: authenticate → not enrolled → STATE 3 choice → Path A or Path B.
   * Mendix login only when outcome=authenticated.
   */
  async authenticateOrRegister(
    employeeId: string,
  ): Promise<AuthenticateOrRegisterOutcome> {
    const normalizedId = employeeId.trim();
    if (!normalizedId) {
      throw new Error(
        "FaceAuthSDK.authenticateOrRegister() requires a non-empty employeeId.",
      );
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
        const choice = await this.promptNotEnrolledChoice(normalizedId);

        if (choice === "employee_register") {
          const registration = await this.promptRegisterAndSubmit(normalizedId);
          return { outcome: "registered", registration };
        }

        await this.runAdminKioskSession();
        return { outcome: "admin_kiosk_session_completed" };
      }
      throw error;
    }
  }

  /** Browser capture only — returns JPEG for manual / harness testing. */
  async captureFace(): Promise<FaceCaptureResult> {
    this.assertBrowser("captureFace");
    if (this.captureWaiters) {
      throw new Error("A capture session is already in progress.");
    }

    this.captureIntent = CaptureIntent.Manual;
    return this.startCapturePipeline();
  }

  async openCamera(): Promise<FaceAuthSDKCameraSession> {
    this.assertBrowser("openCamera");
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

    this.rejectCapture(this.cancelledError("Capture cancelled."));
    this.pipelineEnabled = false;
    this.cameraOpen = false;
    this.render();
    this.config.onCameraClose?.();
    return this.getCameraSession();
  }

  async destroy(): Promise<void> {
    dismissSdkFeedbackToast();
    this.clearEnrollmentPreview();

    this.rejectCapture(this.cancelledError("SDK destroyed."));
    this.rejectNotEnrolledChoice(this.cancelledError("SDK destroyed."));
    this.rejectRegisterFlow(this.cancelledError("SDK destroyed."));
    void this.teardownAdminSession(false);

    this.pipelineEnabled = false;
    this.cameraOpen = false;
    this.authClient = null;
    this.clearAuthCapture();
    this.transitionTo(SdkUiState.Idle);

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

  // =========================================================================
  // STATE 3 — not enrolled choice
  // =========================================================================

  private async promptNotEnrolledChoice(
    employeeId: string,
  ): Promise<NotEnrolledChoice> {
    this.assertBrowser("promptNotEnrolledChoice");

    this.notEnrolledEmployeeId = employeeId;
    this.notEnrolledBusy = false;
    this.transitionTo(SdkUiState.NotEnrolledChoice);
    this.render();

    return new Promise<NotEnrolledChoice>((resolve, reject) => {
      this.notEnrolledWaiters = { resolve, reject };
    });
  }

  private resolveNotEnrolledChoice(choice: NotEnrolledChoice): void {
    const waiters = this.notEnrolledWaiters;
    this.notEnrolledWaiters = null;
    this.notEnrolledBusy = false;
    this.notEnrolledEmployeeId = "";
    waiters?.resolve(choice);
  }

  private rejectNotEnrolledChoice(error: Error): void {
    const waiters = this.notEnrolledWaiters;
    this.notEnrolledWaiters = null;
    this.notEnrolledBusy = false;
    this.notEnrolledEmployeeId = "";
    waiters?.reject(error);
  }

  private handleNotEnrolledChoice(choice: NotEnrolledChoice): void {
    this.notEnrolledBusy = true;
    this.render();

    if (choice === "admin_kiosk_login") {
      // Path B never reuses the failed-auth JPEG.
      this.clearAuthCapture();
    }

    this.transitionTo(SdkUiState.Idle);
    this.resolveNotEnrolledChoice(choice);
    this.render();
  }

  private handleNotEnrolledCancel(): void {
    this.clearAuthCapture();
    this.showFeedback(feedbackRegistrationCancelled());
    this.transitionTo(SdkUiState.Idle);
    this.rejectNotEnrolledChoice(
      this.cancelledError("Enrollment choice cancelled."),
    );
    this.render();
  }

  // =========================================================================
  // Path B — admin kiosk session (STATE 4 → 5)
  // =========================================================================

  private async runAdminKioskSession(): Promise<void> {
    this.assertBrowser("runAdminKioskSession");

    this.adminLoginError = null;
    this.adminLoginBusy = false;
    this.transitionTo(SdkUiState.AdminLogin);
    this.render();

    await new Promise<void>((resolve, reject) => {
      this.adminSessionWaiters = { resolve, reject };
    });
  }

  private async handleAdminLoginSubmit(
    payload: AdminKioskLoginSubmitPayload,
  ): Promise<void> {
    this.adminLoginBusy = true;
    this.adminLoginError = null;
    this.render();

    try {
      const response = await this.getAuthClient().kioskAdminLogin({
        employeeId: payload.employeeId,
        password: payload.password,
      });
      this.adminSession = toKioskAdminSession(response);
      this.adminLoginBusy = false;
      this.adminLoginError = null;
      this.adminEnrollError = null;
      this.adminLastEnrolledId = null;
      this.transitionTo(SdkUiState.AdminEnroll);
      this.showFeedback(feedbackAdminKioskLoginSuccess(response.employeeId));
      this.render();
    } catch (error) {
      this.adminLoginBusy = false;
      this.adminLoginError = userFacingErrorMessage(error, "kiosk");
      this.showFeedback(
        isFaceAuthApiError(error)
          ? feedbackFromKioskAdminApiError(error)
          : feedbackFromUnknownError(error),
      );
      this.render();
    }
  }

  private handleAdminLoginCancel(): void {
    this.adminLoginError = null;
    this.adminLoginBusy = false;
    this.transitionTo(SdkUiState.Idle);
    this.rejectAdminSession(this.cancelledError("Admin kiosk login cancelled."));
    this.render();
  }

  private async handleAdminEnrollNext(targetEmployeeId: string): Promise<void> {
    if (!this.adminSession) {
      return;
    }

    this.adminEnrollTargetId = targetEmployeeId;
    this.adminEnrollBusy = true;
    this.adminEnrollError = null;
    this.render();

    try {
      // Fresh capture — never reuse auth JPEG (Path B invariant).
      this.captureIntent = CaptureIntent.AdminEnroll;
      const frame = await this.startCapturePipeline();
      await this.showEnrollmentPreview(frame, {
        caption: "Face captured",
        subtitle: `Enrolling ${targetEmployeeId.trim()}…`,
      });
      const result = await this.getAuthClient().kioskAdminEnroll(
        this.adminSession.adminSessionToken,
        {
          employeeId: targetEmployeeId,
          image: frame,
          sessionId: this.createSessionId(),
        },
      );

      this.finishAdminEnrollSuccess(result);
    } catch (error) {
      this.adminEnrollBusy = false;
      this.adminEnrollTargetId = null;

      const code = (error as Error & { code?: string }).code;
      if (code === "CANCELLED") {
        this.adminEnrollError = null;
      } else if (isCaptureRelatedErrorCode(code)) {
        this.adminEnrollError = userFacingErrorMessage(error, "general");
      } else {
        this.adminEnrollError = userFacingErrorMessage(error, "kiosk");
        this.showFeedback(
          isFaceAuthApiError(error)
            ? feedbackFromKioskAdminApiError(error)
            : feedbackFromUnknownError(error),
        );
      }
      this.render();
    }
  }

  private finishAdminEnrollSuccess(result: KioskAdminEnrollResult): void {
    this.adminEnrollBusy = false;
    this.adminEnrollTargetId = null;
    this.adminEnrollError = null;
    this.adminLastEnrolledId = result.employeeId;
    this.adminEnrollFormKey += 1;
    this.showFeedback(feedbackFromKioskAdminEnroll(result));
    this.render();
  }

  private async handleAdminEndSession(): Promise<void> {
    await this.teardownAdminSession(true);
    this.transitionTo(SdkUiState.Idle);
    this.resolveAdminSession();
    this.render();
  }

  private async teardownAdminSession(showToast: boolean): Promise<void> {
    const token = this.adminSession?.adminSessionToken;
    this.adminSession = null;
    this.adminLoginBusy = false;
    this.adminLoginError = null;
    this.adminEnrollBusy = false;
    this.adminEnrollError = null;
    this.adminEnrollTargetId = null;
    this.adminLastEnrolledId = null;

    if (token) {
      try {
        await this.getAuthClient().kioskAdminLogout(token);
      } catch {
        // Best-effort logout — session may already be expired server-side.
      }
    }

    if (showToast) {
      this.showFeedback(feedbackAdminKioskSessionEnded());
    }
  }

  private resolveAdminSession(): void {
    const waiters = this.adminSessionWaiters;
    this.adminSessionWaiters = null;
    waiters?.resolve();
  }

  private rejectAdminSession(error: Error): void {
    const waiters = this.adminSessionWaiters;
    this.adminSessionWaiters = null;
    void this.teardownAdminSession(false);
    waiters?.reject(error);
  }

  // =========================================================================
  // Camera + capture routing
  // =========================================================================

  private async captureForAuthenticate(): Promise<FaceCaptureResult> {
    this.captureIntent = CaptureIntent.Authenticate;
    return this.startCapturePipeline();
  }

  private async startCapturePipeline(): Promise<FaceCaptureResult> {
    this.ensureMounted();
    this.pipelineEnabled = true;
    this.cameraOpen = true;
    this.render();

    return new Promise<FaceCaptureResult>((resolve, reject) => {
      this.captureWaiters = { resolve, reject };
    });
  }

  private showEnrollmentPreview(
    frame: FaceCaptureResult,
    copy: { caption: string; subtitle?: string },
  ): Promise<void> {
    this.clearEnrollmentPreview();

    const durationMs = this.config.enrollmentPreviewDurationMs ?? 1800;

    return new Promise((resolve) => {
      this.enrollmentPreview = {
        dataUrl: frame.dataUrl,
        caption: copy.caption,
        subtitle: copy.subtitle,
      };
      this.enrollmentPreviewWaiters = { resolve };
      this.render();

      this.enrollmentPreviewTimer = setTimeout(() => {
        this.clearEnrollmentPreview();
      }, durationMs);
    });
  }

  private clearEnrollmentPreview(): void {
    if (this.enrollmentPreviewTimer) {
      clearTimeout(this.enrollmentPreviewTimer);
      this.enrollmentPreviewTimer = null;
    }
    this.enrollmentPreview = null;
    const waiters = this.enrollmentPreviewWaiters;
    this.enrollmentPreviewWaiters = null;
    waiters?.resolve();
  }

  private finishCaptureSuccess(result: FaceCaptureResult): void {
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    this.cameraOpen = false;
    waiters?.resolve(result);
    this.render();
  }

  private finishCaptureFailure(failure: FaceCaptureFailure): void {
    this.showFeedback(feedbackFromCaptureFailure(failure));
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    this.cameraOpen = false;

    if (waiters) {
      waiters.reject(
        Object.assign(new Error(failure.message), {
          code: failure.code,
          phase: failure.phase,
        }),
      );
    }
    this.render();
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
    this.cameraOpen = false;
    waiters?.reject(error);
  }

  // =========================================================================
  // Path A register overlay handlers
  // =========================================================================

  private rejectRegisterFlow(error: Error): void {
    const waiters = this.registerFlowWaiters;
    this.registerFlowWaiters = null;
    this.registerBusy = false;
    this.registerError = null;
    if (this.uiState === SdkUiState.Register) {
      this.transitionTo(SdkUiState.Idle);
    }
    waiters?.reject(error);
  }

  private finishRegisterFlowSuccess(result: RegisterResult): void {
    const waiters = this.registerFlowWaiters;
    this.registerFlowWaiters = null;
    this.registerBusy = false;
    this.registerError = null;
    this.transitionTo(SdkUiState.Idle);
    waiters?.resolve(result);
  }

  private handleRegisterCancel(): void {
    this.clearAuthCapture();
    this.showFeedback(feedbackRegistrationCancelled());
    this.transitionTo(SdkUiState.Idle);
    this.rejectRegisterFlow(
      this.cancelledError("Registration cancelled."),
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
      this.registerError = userFacingErrorMessage(error, "registration");
      this.render();
    }
  }

  // =========================================================================
  // Render — layered overlays (camera stacks above forms)
  // =========================================================================

  private render(): void {
    if (!this.root) {
      return;
    }

    const layers: ReturnType<typeof createElement>[] = [];

    if (this.uiState === SdkUiState.NotEnrolledChoice) {
      layers.push(
        createElement(NotEnrolledChoiceOverlay, {
          key: "not-enrolled-choice",
          open: true,
          employeeId: this.notEnrolledEmployeeId,
          busy: this.notEnrolledBusy,
          onChooseEmployeeRegister: () => {
            this.handleNotEnrolledChoice("employee_register");
          },
          onChooseAdminKioskLogin: () => {
            this.handleNotEnrolledChoice("admin_kiosk_login");
          },
          onCancel: () => {
            this.handleNotEnrolledCancel();
          },
        }),
      );
    }

    if (this.uiState === SdkUiState.Register) {
      layers.push(
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
    }

    if (this.uiState === SdkUiState.AdminLogin) {
      layers.push(
        createElement(AdminKioskLoginOverlay, {
          key: "admin-login",
          open: true,
          busy: this.adminLoginBusy,
          errorMessage: this.adminLoginError,
          onSubmit: (payload) => {
            void this.handleAdminLoginSubmit(payload);
          },
          onCancel: () => {
            this.handleAdminLoginCancel();
          },
        }),
      );
    }

    if (this.uiState === SdkUiState.AdminEnroll && this.adminSession) {
      layers.push(
        createElement(AdminEnrollLoopOverlay, {
          key: `admin-enroll-${this.adminEnrollFormKey}`,
          open: true,
          session: this.adminSession,
          busy: this.adminEnrollBusy,
          errorMessage: this.adminEnrollError,
          lastEnrolledEmployeeId: this.adminLastEnrolledId,
          onEnrollNext: (targetEmployeeId) => {
            void this.handleAdminEnrollNext(targetEmployeeId);
          },
          onEndSession: () => {
            void this.handleAdminEndSession();
          },
        }),
      );
    }

    if (this.enrollmentPreview) {
      layers.push(
        createElement(EnrollmentFacePreviewOverlay, {
          key: "enrollment-preview",
          open: true,
          dataUrl: this.enrollmentPreview.dataUrl,
          caption: this.enrollmentPreview.caption,
          subtitle: this.enrollmentPreview.subtitle,
          durationMs: this.config.enrollmentPreviewDurationMs ?? 1800,
        }),
      );
    }

    if (this.cameraOpen) {
      layers.push(
        createElement(CameraOverlay, {
          key: "camera",
          open: true,
          startOptions: this.config.camera,
          title: this.resolveCameraTitle(),
          enableCapturePipeline: this.pipelineEnabled,
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
            this.rejectCapture(this.cancelledError("Capture cancelled."));
            this.render();
            this.config.onCameraClose?.();
          },
        }),
      );
    }

    this.root.render(
      layers.length > 0
        ? createElement(Fragment, null, ...layers)
        : null,
    );
  }

  private resolveCameraTitle(): string | undefined {
    if (this.captureIntent === CaptureIntent.AdminEnroll && this.adminEnrollTargetId) {
      return `Enroll ${this.adminEnrollTargetId}`;
    }
    return this.config.title;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private transitionTo(next: SdkUiState): void {
    this.uiState = next;
  }

  private assertBrowser(method: string): void {
    if (typeof document === "undefined") {
      throw new Error(`FaceAuthSDK.${method}() requires a browser environment.`);
    }
    this.ensureMounted();
  }

  private assertNotInAdminEnrollLoop(method: string): void {
    if (this.uiState === SdkUiState.AdminEnroll) {
      throw new Error(
        `FaceAuthSDK.${method}() cannot run during admin enroll loop. End the admin session first.`,
      );
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

  private showFeedback(payload: SdkFeedbackPayload): void {
    if (this.config.showFeedbackToast === false) {
      return;
    }
    showSdkFeedbackToast(payload, {
      durationMs: this.config.feedbackToastDurationMs,
    });
  }

  private storeAuthCapture(frame: FaceCaptureResult): void {
    this.lastCapture = frame;
    this.lastSessionId = this.createSessionId();
  }

  private clearAuthCapture(): void {
    this.lastCapture = null;
    this.lastSessionId = null;
  }

  private createSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `capture-${Date.now()}`;
  }

  private cancelledError(message: string): Error {
    return Object.assign(new Error(message), { code: "CANCELLED" });
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
}

export function createFaceAuthSDK(config: FaceAuthSDKConfig = {}): FaceAuthSDK {
  return new FaceAuthSDK(config);
}

export type { RegisterResult };
