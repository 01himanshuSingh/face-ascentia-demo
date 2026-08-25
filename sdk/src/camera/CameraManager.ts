import {
  FACE_AUTH_CAMERA_POLICY,
  type CameraDeviceInfo,
  type CameraError,
  type CameraErrorCode,
  type CameraEvent,
  type CameraEventListener,
  type CameraManagerApi,
  type CameraSessionSnapshot,
  type CameraStartOptions,
  type CameraStatus,
  type CameraTrackInfo,
  type CameraVideoPreferences,
} from "./camera.types";

/**
 * Browser camera lifecycle manager for the Face Authentication SDK.
 *
 * Responsibilities:
 * - Request video-only permission (no microphone)
 * - Use the browser default camera unless an optional deviceId is provided
 * - Start / stop MediaStream with explicit status transitions
 * - Release tracks reliably on stop, error, and USB disconnect
 * - Emit typed events for CameraOverlay / FaceAuthSDK / Mendix host
 *
 * Hardware-agnostic: works with Logitech C270 or any other videoinput.
 * Do not hardcode a kiosk-specific deviceId in SDK defaults.
 *
 * Non-goals (later phases):
 * - Frame capture / burst selection
 * - Liveness / blink detection
 * - Backend communication
 */
export class CameraManager implements CameraManagerApi {
  private status: CameraStatus = "idle";
  private stream: MediaStream | null = null;
  private error: CameraError | null = null;
  private startedAt: number | null = null;
  private readonly listeners = new Set<CameraEventListener>();
  private videoTrack: MediaStreamTrack | null = null;
  private trackEndedHandler: (() => void) | null = null;
  /** Serializes start/stop so concurrent calls cannot leak streams. */
  private operationQueue: Promise<unknown> = Promise.resolve();
  /** Monotonic token to ignore stale async start results after stop/cleanup. */
  private generation = 0;

  get snapshot(): CameraSessionSnapshot {
    return this.buildSnapshot();
  }

  subscribe(listener: CameraEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(options: CameraStartOptions = {}): Promise<CameraSessionSnapshot> {
    return this.enqueue(async () => this.startInternal(options));
  }

  async stop(): Promise<CameraSessionSnapshot> {
    return this.enqueue(async () => this.stopInternal("manual"));
  }

  async cleanup(): Promise<void> {
    await this.enqueue(async () => {
      await this.releaseStream();
      this.error = null;
      this.startedAt = null;
      this.setStatus("idle");
    });
  }

  async listDevices(): Promise<CameraDeviceInfo[]> {
    if (!this.isMediaDevicesSupported()) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || "Camera",
        groupId: device.groupId,
      }));
  }

  // -------------------------------------------------------------------------
  // Internal lifecycle
  // -------------------------------------------------------------------------

  private async startInternal(
    options: CameraStartOptions,
  ): Promise<CameraSessionSnapshot> {
    if (this.status === "active" && this.stream) {
      const alreadyActive = this.createError(
        "ALREADY_ACTIVE",
        "Camera is already active. Stop it before starting again.",
        false,
      );
      this.fail(alreadyActive);
      throw alreadyActive;
    }

    const preflightError = this.preflightChecks();
    if (preflightError) {
      this.fail(preflightError);
      throw preflightError;
    }

    const generation = ++this.generation;
    this.error = null;

    try {
      this.setStatus("requesting_permission");
      this.setStatus("starting");

      const constraints = this.buildConstraints(options.video);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (generation !== this.generation) {
        this.stopTracks(stream);
        const cancelled = this.createError(
          "NOT_ACTIVE",
          "Camera start was cancelled before the stream became active.",
          true,
        );
        throw cancelled;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        this.stopTracks(stream);
        const missingTrack = this.createError(
          "DEVICE_NOT_FOUND",
          "Camera stream started without a video track.",
          true,
        );
        this.fail(missingTrack);
        throw missingTrack;
      }

      if (options.strictDeviceMatch && options.video?.deviceId) {
        const actualId = videoTrack.getSettings().deviceId;
        if (actualId && actualId !== options.video.deviceId) {
          this.stopTracks(stream);
          const mismatch = this.createError(
            "CONSTRAINT_NOT_SATISFIED",
            "Requested camera device is not available.",
            true,
          );
          this.fail(mismatch);
          throw mismatch;
        }
      }

      this.attachStream(stream, videoTrack);
      this.startedAt = Date.now();
      this.error = null;
      this.setStatus("active");

      const snapshot = this.buildSnapshot();
      this.emit({ type: "started", snapshot });
      return snapshot;
    } catch (cause) {
      if (this.isCameraError(cause) && cause.code === "NOT_ACTIVE") {
        throw cause;
      }

      await this.releaseStream();
      const mapped = this.isCameraError(cause)
        ? cause
        : this.mapDomError(cause);
      this.fail(mapped);
      throw mapped;
    }
  }

  private async stopInternal(
    reason: "manual" | "error" | "track_ended",
  ): Promise<CameraSessionSnapshot> {
    this.generation += 1;

    if (
      this.status === "idle" ||
      this.status === "stopped" ||
      (this.status !== "active" &&
        this.status !== "starting" &&
        this.status !== "requesting_permission" &&
        !this.stream)
    ) {
      if (!this.stream) {
        this.setStatus(this.status === "error" ? "error" : "stopped");
        return this.buildSnapshot();
      }
    }

    this.setStatus("stopping");
    await this.releaseStream();
    this.startedAt = null;

    if (reason === "manual") {
      this.error = null;
    }

    this.setStatus(this.error ? "error" : "stopped");
    const snapshot = this.buildSnapshot();
    this.emit({ type: "stopped", snapshot, reason });
    return snapshot;
  }

  // -------------------------------------------------------------------------
  // Stream / track helpers
  // -------------------------------------------------------------------------

  private attachStream(stream: MediaStream, track: MediaStreamTrack): void {
    this.stream = stream;
    this.videoTrack = track;
    this.trackEndedHandler = () => {
      void this.onTrackEnded();
    };
    track.addEventListener("ended", this.trackEndedHandler);
  }

  private async onTrackEnded(): Promise<void> {
    if (this.status !== "active") {
      return;
    }

    const disconnected = this.createError(
      "DEVICE_DISCONNECTED",
      "Camera track ended unexpectedly. The device may have been disconnected.",
      true,
    );
    this.error = disconnected;
    this.emit({
      type: "error",
      error: disconnected,
      snapshot: this.buildSnapshot(),
    });
    this.emit({
      type: "track_ended",
      snapshot: this.buildSnapshot(),
    });
    await this.enqueue(async () => this.stopInternal("track_ended"));
  }

  private async releaseStream(): Promise<void> {
    if (this.videoTrack && this.trackEndedHandler) {
      this.videoTrack.removeEventListener("ended", this.trackEndedHandler);
    }
    this.trackEndedHandler = null;

    if (this.stream) {
      this.stopTracks(this.stream);
    }

    this.stream = null;
    this.videoTrack = null;
  }

  private stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Track stop must never block cleanup.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Constraints / environment
  // -------------------------------------------------------------------------

  private preflightChecks(): CameraError | null {
    if (typeof window === "undefined") {
      return this.createError(
        "UNSUPPORTED_BROWSER",
        "Camera requires a browser environment.",
        false,
      );
    }

    if (!window.isSecureContext) {
      return this.createError(
        "SECURE_CONTEXT_REQUIRED",
        "Camera access requires HTTPS or localhost.",
        false,
      );
    }

    if (!this.isMediaDevicesSupported()) {
      return this.createError(
        "UNSUPPORTED_BROWSER",
        "This browser does not support mediaDevices.getUserMedia.",
        false,
      );
    }

    return null;
  }

  private isMediaDevicesSupported(): boolean {
    return Boolean(
      typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function",
    );
  }

  private buildConstraints(
    video?: CameraVideoPreferences,
  ): MediaStreamConstraints {
    const videoConstraint: boolean | MediaTrackConstraints = video
      ? this.toTrackConstraints(video)
      : true;

    return {
      video: videoConstraint,
      audio: FACE_AUTH_CAMERA_POLICY.audio,
    };
  }

  private toTrackConstraints(
    video: CameraVideoPreferences,
  ): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {};

    if (video.deviceId) {
      constraints.deviceId = { exact: video.deviceId };
    }
    if (video.width !== undefined) {
      constraints.width = { ideal: video.width };
    }
    if (video.height !== undefined) {
      constraints.height = { ideal: video.height };
    }
    if (video.frameRate !== undefined) {
      constraints.frameRate = { ideal: video.frameRate };
    }
    if (video.facingMode) {
      constraints.facingMode = { ideal: video.facingMode };
    }

    return constraints;
  }

  // -------------------------------------------------------------------------
  // Errors / events / snapshot
  // -------------------------------------------------------------------------

  private fail(error: CameraError): void {
    this.error = error;
    this.setStatus("error");
    this.emit({
      type: "error",
      error,
      snapshot: this.buildSnapshot(),
    });
  }

  private setStatus(next: CameraStatus): void {
    const previous = this.status;
    if (previous === next) {
      return;
    }
    this.status = next;
    this.emit({
      type: "status_changed",
      previous,
      current: next,
      snapshot: this.buildSnapshot(),
    });
  }

  private buildSnapshot(): CameraSessionSnapshot {
    return {
      status: this.status,
      stream: this.stream,
      videoTrack: this.toTrackInfo(this.videoTrack),
      error: this.error,
      startedAt: this.startedAt,
    };
  }

  private toTrackInfo(track: MediaStreamTrack | null): CameraTrackInfo | null {
    if (!track) {
      return null;
    }
    return {
      trackId: track.id,
      label: track.label,
      readyState: track.readyState,
      settings: track.getSettings(),
    };
  }

  private emit(event: CameraEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Host listener failures must not break camera lifecycle.
      }
    }
  }

  private mapDomError(cause: unknown): CameraError {
    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name: unknown }).name)
        : undefined;
    const message =
      cause instanceof Error
        ? cause.message
        : "An unknown camera error occurred.";

    switch (name) {
      case "NotAllowedError":
        return this.createError(
          "PERMISSION_DENIED",
          "Camera permission was denied.",
          false,
          name,
        );
      case "NotFoundError":
      case "DevicesNotFoundError":
        return this.createError(
          "DEVICE_NOT_FOUND",
          "No camera device was found.",
          true,
          name,
        );
      case "NotReadableError":
      case "TrackStartError":
        return this.createError(
          "DEVICE_IN_USE",
          "Camera is already in use by another application.",
          true,
          name,
        );
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return this.createError(
          "CONSTRAINT_NOT_SATISFIED",
          "Camera constraints could not be satisfied.",
          true,
          name,
        );
      case "SecurityError":
        return this.createError(
          "SECURE_CONTEXT_REQUIRED",
          message || "Camera access blocked by browser security policy.",
          false,
          name,
        );
      case "AbortError":
        return this.createError(
          "PERMISSION_DISMISSED",
          "Camera permission request was dismissed or aborted.",
          true,
          name,
        );
      default:
        return this.createError("UNKNOWN", message, true, name);
    }
  }

  private createError(
    code: CameraErrorCode,
    message: string,
    retryable: boolean,
    causeName?: string,
  ): CameraError {
    return { code, message, retryable, causeName };
  }

  private isCameraError(value: unknown): value is CameraError {
    return Boolean(
      value &&
        typeof value === "object" &&
        "code" in value &&
        "message" in value &&
        "retryable" in value,
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/** Factory for SDK / tests — prefer this over constructing internals ad hoc. */
export function createCameraManager(): CameraManager {
  return new CameraManager();
}
