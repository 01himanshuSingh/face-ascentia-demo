import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createFaceAuthClient,
  FaceAuthApiError,
  type FaceAuthClient,
} from "../api/FaceAuthClient";
import type { CameraStartOptions } from "../camera/camera.types";
import { CameraOverlay } from "../components/CameraOverlay";
import type {
  CapturePhase,
  FaceCaptureFailure,
  FaceCaptureResult,
  MendixAuthenticateResult,
} from "../types/auth.types";

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
   * Required for authenticate().
   */
  apiBaseUrl?: string;

  /** Optional fetch override (tests / restricted Mendix environments). */
  fetchFn?: typeof fetch;

  /** POST /authenticate timeout in ms. Default 30_000. */
  authTimeoutMs?: number;

  camera?: CameraStartOptions;
  title?: string;
  faceTimeoutMs?: number;
  blinkTimeoutMs?: number;
  mountNode?: HTMLElement;
  onCameraClose?: () => void;
  onPhaseChange?: (phase: CapturePhase) => void;
}

export interface FaceAuthSDKCameraSession {
  readonly isOpen: boolean;
}

/**
 * Imperative facade shipped to the Mendix team as an npm package.
 *
 * Mendix production entry:
 *   const sdk = createFaceAuthSDK({ apiBaseUrl: "https://..." });
 *   const { employeeId, authenticated } = await sdk.authenticate("EMP001");
 *
 * Mendix must NOT open getUserMedia, build camera UI, or call the backend directly.
 */
export class FaceAuthSDK {
  private readonly config: FaceAuthSDKConfig;
  private hostNode: HTMLElement | null = null;
  private root: Root | null = null;
  private cameraOpen = false;
  private ownedHost = false;
  private pipelineEnabled = false;
  private authClient: FaceAuthClient | null = null;
  private captureWaiters: {
    resolve: (result: FaceCaptureResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(config: FaceAuthSDKConfig = {}) {
    this.config = config;
  }

  getCameraSession(): FaceAuthSDKCameraSession {
    return { isOpen: this.cameraOpen };
  }

  /**
   * Mendix authenticate action — one call for the full Week 1 kiosk flow.
   *
   * 1. Opens SDK camera overlay (unless `capture` already provided)
   * 2. face → blink → burst → auto-close
   * 3. POST JPEG + employeeId to Debian /authenticate
   * 4. Returns slim result for Mendix ({ employeeId, authenticated })
   *
   * Wrong face → authenticated=false (not thrown).
   * Pipeline / network failures → FaceAuthApiError.
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
    const apiResult = await this.getAuthClient().authenticate({
      employeeId: normalizedId,
      image: frame,
    });

    return {
      employeeId: apiResult.employeeId,
      authenticated: apiResult.authenticated,
    };
  }

  /**
   * Browser capture only — returns the best JPEG for manual/backend testing.
   *
   * Mendix should prefer authenticate() which captures and verifies in one step.
   *
   * Flow: camera → face → blink → burst → auto-close → FaceCaptureResult
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

  /** Manual open without capture pipeline (local smoke tests only). */
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
    this.rejectCapture(
      Object.assign(new Error("SDK destroyed."), { code: "CANCELLED" }),
    );
    this.pipelineEnabled = false;
    this.cameraOpen = false;
    this.authClient = null;

    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    if (this.ownedHost && this.hostNode?.parentNode) {
      this.hostNode.parentNode.removeChild(this.hostNode);
    }

    this.hostNode = null;
    this.ownedHost = false;
  }

  private getAuthClient(): FaceAuthClient {
    const base = this.config.apiBaseUrl?.trim();
    if (!base) {
      throw new FaceAuthApiError("apiBaseUrl is required for authenticate().", {
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
    const waiters = this.captureWaiters;
    this.captureWaiters = null;
    this.pipelineEnabled = false;
    waiters?.reject(error);
  }

  private render(): void {
    if (!this.root) {
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
