/**
 * Burst capture + best-frame selection for face auth.
 *
 * System design (kiosk):
 *   Light eye-blink gate (SDK) — not the quality step
 *        ↓
 *   Instant burst → pick sharpest / best-lit centered frame
 *        ↓
 *   ONE JPEG → Debian SFace embedding (match quality lives here)
 *
 * Call only after blink_confirmed. Do not wait for another face lock.
 */

export interface BurstCaptureOptions {
  /** Number of frames to grab. Default 5. */
  frameCount?: number;
  /**
   * Delay between frames in ms.
   * `0` = consecutive camera frames (requestVideoFrameCallback / double-rAF).
   * Default 60.
   */
  intervalMs?: number;
  /** Output JPEG quality 0..1. Default 0.92. */
  jpegQuality?: number;
  /** Max output width (keeps aspect). Default 640 — C270-class / bandwidth friendly. */
  maxWidth?: number;
}

export interface FrameQuality {
  sharpness: number;
  brightness: number;
  centerWeight: number;
  /** Combined rank score — higher is better. */
  score: number;
}

export interface CapturedFrame {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
  quality: FrameQuality;
}

export interface BurstCaptureResult {
  bestFrame: CapturedFrame;
  framesConsidered: number;
}

export type BurstCaptureErrorCode =
  | "VIDEO_NOT_READY"
  | "CAPTURE_FAILED"
  | "NO_USABLE_FRAME";

export class BurstCaptureError extends Error {
  readonly code: BurstCaptureErrorCode;

  constructor(code: BurstCaptureErrorCode, message: string) {
    super(message);
    this.name = "BurstCaptureError";
    this.code = code;
  }
}

const DEFAULTS = {
  frameCount: 5,
  intervalMs: 60,
  jpegQuality: 0.92,
  maxWidth: 640,
} as const;

/**
 * Burst after light blink: short camera-cadence sample, pick sharpest open-eye still.
 * Motive: best embedding input — not heavy liveness.
 */
export const POST_BLINK_CAPTURE: Required<
  Pick<BurstCaptureOptions, "frameCount" | "intervalMs" | "jpegQuality" | "maxWidth">
> = {
  frameCount: 7,
  intervalMs: 0,
  jpegQuality: 0.93,
  maxWidth: 640,
};

/** Ideal mean luma band for kiosk indoor lighting. */
const BRIGHTNESS_TARGET = 110;
const BRIGHTNESS_TOLERANCE = 70;

interface ScoredRaster {
  imageData: ImageData;
  width: number;
  height: number;
  capturedAt: number;
  quality: FrameQuality;
}

export class BurstCapture {
  /**
   * Instant burst from a playing video; return the single best JPEG.
   */
  async capture(
    video: HTMLVideoElement,
    options: BurstCaptureOptions = {},
  ): Promise<BurstCaptureResult> {
    const frameCount = options.frameCount ?? DEFAULTS.frameCount;
    const intervalMs = options.intervalMs ?? DEFAULTS.intervalMs;
    const jpegQuality = options.jpegQuality ?? DEFAULTS.jpegQuality;
    const maxWidth = options.maxWidth ?? DEFAULTS.maxWidth;

    assertVideoReady(video);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new BurstCaptureError(
        "CAPTURE_FAILED",
        "Canvas 2D context is unavailable.",
      );
    }

    const candidates: ScoredRaster[] = [];

    for (let i = 0; i < frameCount; i += 1) {
      if (i > 0) {
        if (intervalMs <= 0) {
          await waitForNextVideoFrame(video);
        } else {
          await sleep(intervalMs);
        }
      }
      assertVideoReady(video);
      candidates.push(sampleVideoFrame(video, canvas, ctx, maxWidth));
    }

    const bestRaster = pickBestRaster(candidates);
    if (!bestRaster) {
      throw new BurstCaptureError(
        "NO_USABLE_FRAME",
        "Burst capture produced no usable frame.",
      );
    }

    canvas.width = bestRaster.width;
    canvas.height = bestRaster.height;
    ctx.putImageData(bestRaster.imageData, 0, 0);

    const blob = await canvasToJpegBlob(canvas, jpegQuality);
    const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);

    return {
      bestFrame: {
        blob,
        dataUrl,
        width: bestRaster.width,
        height: bestRaster.height,
        capturedAt: bestRaster.capturedAt,
        quality: bestRaster.quality,
      },
      framesConsidered: candidates.length,
    };
  }
}

export function createBurstCapture(): BurstCapture {
  return new BurstCapture();
}

export function pickBestFrame(
  frames: readonly CapturedFrame[],
): CapturedFrame | null {
  if (frames.length === 0) {
    return null;
  }
  let best = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].quality.score > best.quality.score) {
      best = frames[i];
    }
  }
  return best;
}

function pickBestRaster(
  frames: readonly ScoredRaster[],
): ScoredRaster | null {
  if (frames.length === 0) {
    return null;
  }
  let best = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].quality.score > best.quality.score) {
      best = frames[i];
    }
  }
  return best;
}

export function scoreImageData(image: ImageData): FrameQuality {
  const { data, width, height } = image;
  const gray = new Float32Array(width * height);

  let brightnessSum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601 luma
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = y;
    brightnessSum += y;
  }

  const brightness = brightnessSum / gray.length;
  const sharpness = laplacianVariance(gray, width, height);
  const centerWeight = centerEnergyRatio(gray, width, height);

  const brightnessScore =
    1 -
    Math.min(1, Math.abs(brightness - BRIGHTNESS_TARGET) / BRIGHTNESS_TOLERANCE);

  // Embedding-first: sharpness dominates (motion blur kills SFace match quality).
  const score =
    sharpness * 1.6 + brightnessScore * 28 + centerWeight * 22;

  return { sharpness, brightness, centerWeight, score };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertVideoReady(video: HTMLVideoElement): void {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    throw new BurstCaptureError(
      "VIDEO_NOT_READY",
      "Video stream is not ready for frame capture.",
    );
  }
}

/** Score a video frame in memory — JPEG encode happens once for the winner. */
function sampleVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  maxWidth: number,
): ScoredRaster {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(video, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    imageData,
    width,
    height,
    capturedAt: Date.now(),
    quality: scoreImageData(imageData),
  };
}

/**
 * Wait for the next decoded camera frame so burst samples are not duplicates
 * of the same painted bitmap when intervalMs is 0.
 */
function waitForNextVideoFrame(video: HTMLVideoElement): Promise<void> {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (
      callback: (now: number, metadata: unknown) => void,
    ) => number;
  };

  if (typeof withCallback.requestVideoFrameCallback === "function") {
    return new Promise((resolve) => {
      withCallback.requestVideoFrameCallback!(() => resolve());
    });
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new BurstCaptureError(
              "CAPTURE_FAILED",
              "Failed to encode JPEG frame.",
            ),
          );
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/** Approx Laplacian variance on luma — higher = sharper. */
function laplacianVariance(
  gray: Float32Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) {
    return 0;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        -4 * gray[i] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i - width] +
        gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (count === 0) {
    return 0;
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * Ratio of energy in the center 50% box vs full frame.
 * Kiosk users stand centered; off-frame faces score lower.
 */
function centerEnergyRatio(
  gray: Float32Array,
  width: number,
  height: number,
): number {
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.floor(width * 0.75);
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.floor(height * 0.75);

  let center = 0;
  let total = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = gray[y * width + x];
      total += v;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        center += v;
      }
    }
  }

  if (total <= 1e-6) {
    return 0;
  }
  return center / total;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
