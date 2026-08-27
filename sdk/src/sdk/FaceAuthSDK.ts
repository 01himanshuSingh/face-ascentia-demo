import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { CameraStartOptions } from "../camera/camera.types";
import { CameraOverlay } from "../components/CameraOverlay";
import type {
  CapturePhase,
  FaceCaptureFailure,
  FaceCaptureResult,
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
   * Used by authenticate() when backend wiring is enabled.
   */
  apiBaseUrl?: string;

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
 * Mendix only:
 *   const sdk = createFaceAuthSDK({ apiBaseUrl: "https://..." });
 *   const frame = await sdk.captureFace();
 *   // later: await sdk.authenticate(employeeId, frame)
 *
 * Mendix must NOT open getUserMedia or build camera UI.
 */
export class FaceAuthSDK {
  private readonly config: FaceAuthSDKConfig;
  private hostNode: HTMLElement | null = null;
  private root: Root | null = null;
  private cameraOpen = false;
  private ownedHost = false;
  private pipelineEnabled = false;
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
   * Production Mendix entry: one call runs the full browser loop and returns
   * the best JPEG for the Debian backend.
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
    // Overlay closes camera via onClose after cleanup.
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
    // Overlay closes camera via onClose after cleanup.
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
