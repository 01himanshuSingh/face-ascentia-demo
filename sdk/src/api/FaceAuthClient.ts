/**
 * Face Auth HTTP client (SDK → Debian backend).
 *
 * Architecture
 * ------------
 *   FaceAuthSDK.authenticate()
 *         ↓
 *   FaceAuthClient.authenticate()     ← this module
 *         ↓
 *   POST {apiBaseUrl}/authenticate
 *         multipart: employee_id + image (JPEG)
 *         ↓
 *   AuthenticateResult (HTTP 200)  OR  FaceAuthApiError (4xx/5xx/network)
 *
 * System boundary
 * ---------------
 * - Owns HTTPS transport only (FormData + fetch).
 * - Does NOT open the camera or run liveness (FaceAuthSDK).
 * - Returns the full backend JSON — FaceAuthSDK maps to Mendix slim result.
 * - Wrong face is HTTP 200 with authenticated=false (not thrown).
 *
 * Mendix never imports this directly; use createFaceAuthSDK().
 */

import type {
  AuthenticateResult,
  AuthErrorBody,
  AuthErrorCode,
  FaceCaptureResult,
} from "../types/auth.types";
import {
  AUTHENTICATE_EMPLOYEE_ID_FIELD,
  AUTHENTICATE_IMAGE_FIELD,
  AUTHENTICATE_PATH,
  isAuthErrorBody,
  isAuthenticateResult,
} from "../types/auth.types";

/** Client-only failure codes (not returned by Debian API). */
export type FaceAuthClientErrorCode =
  | AuthErrorCode
  | "API_NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export interface FaceAuthClientConfig {
  /**
   * Debian API origin, e.g. https://face-auth.customer.local
   * No trailing slash required.
   */
  apiBaseUrl: string;
  /**
   * Optional fetch override (tests / Mendix polyfill environments).
   * Defaults to global fetch.
   */
  fetchFn?: typeof fetch;
  /** Request timeout in ms. Default 30_000. */
  timeoutMs?: number;
}

export interface AuthenticateRequest {
  employeeId: string;
  /** JPEG from FaceAuthSDK burst capture. */
  image: FaceCaptureResult | Blob;
  /** Multipart filename hint. Default face-auth.jpg */
  filename?: string;
}

/**
 * Thrown when POST /authenticate fails (4xx/5xx) or the client cannot complete
 * the request. Wrong-face match is NOT thrown — see AuthenticateResult.
 */
export class FaceAuthApiError extends Error {
  readonly httpStatus: number;
  readonly code: FaceAuthClientErrorCode;
  readonly detail: string;

  constructor(
    message: string,
    options: {
      httpStatus: number;
      code: FaceAuthClientErrorCode;
      detail: string;
    },
  ) {
    super(message);
    this.name = "FaceAuthApiError";
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.detail = options.detail;
  }

  /** True when the server returned a structured AuthErrorBody. */
  get isServerError(): boolean {
    return this.code !== "NETWORK_ERROR" &&
      this.code !== "INVALID_RESPONSE" &&
      this.code !== "API_NOT_CONFIGURED";
  }

  static fromAuthErrorBody(
    body: AuthErrorBody,
    httpStatus: number,
  ): FaceAuthApiError {
    return new FaceAuthApiError(body.detail, {
      httpStatus,
      code: body.code,
      detail: body.detail,
    });
  }
}

export class FaceAuthClient {
  private readonly apiBaseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: FaceAuthClientConfig) {
    const base = config.apiBaseUrl?.trim();
    if (!base) {
      throw new FaceAuthApiError("apiBaseUrl is required for FaceAuthClient.", {
        httpStatus: 0,
        code: "API_NOT_CONFIGURED",
        detail: "Set apiBaseUrl on createFaceAuthSDK({ apiBaseUrl: '...' }).",
      });
    }
    this.apiBaseUrl = base.replace(/\/+$/, "");
    this.fetchFn = config.fetchFn ?? fetch.bind(globalThis);
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  get authenticateUrl(): string {
    return `${this.apiBaseUrl}${AUTHENTICATE_PATH}`;
  }

  /**
   * POST /authenticate — Employee ID + one JPEG still.
   *
   * @returns Full backend decision (including score/threshold for harness UI).
   * @throws FaceAuthApiError on transport or pipeline failures (not wrong face).
   */
  async authenticate(request: AuthenticateRequest): Promise<AuthenticateResult> {
    const employeeId = request.employeeId.trim();
    const { blob, filename } = this.resolveImagePayload(request.image, request.filename);

    const form = new FormData();
    form.append(AUTHENTICATE_EMPLOYEE_ID_FIELD, employeeId);
    form.append(AUTHENTICATE_IMAGE_FIELD, blob, filename);

    let response: Response;
    try {
      response = await this.fetchFn(this.authenticateUrl, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Network request failed.";
      throw new FaceAuthApiError(detail, {
        httpStatus: 0,
        code: "NETWORK_ERROR",
        detail,
      });
    }

    return this.parseAuthenticateResponse(response);
  }

  private resolveImagePayload(
    image: FaceCaptureResult | Blob,
    filename?: string,
  ): { blob: Blob; filename: string } {
    if (image instanceof Blob) {
      return {
        blob: image,
        filename: filename ?? "face-auth.jpg",
      };
    }
    return {
      blob: image.blob,
      filename: filename ?? "face-auth.jpg",
    };
  }

  private async parseAuthenticateResponse(
    response: Response,
  ): Promise<AuthenticateResult> {
    const httpStatus = response.status;
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from POST ${AUTHENTICATE_PATH}.`,
      });
    }

    if (response.ok) {
      if (!isAuthenticateResult(payload)) {
        throw new FaceAuthApiError("Backend returned an invalid success body.", {
          httpStatus,
          code: "INVALID_RESPONSE",
          detail: "Missing employeeId, authenticated, score, threshold, or message.",
        });
      }
      return payload;
    }

    if (isAuthErrorBody(payload)) {
      throw FaceAuthApiError.fromAuthErrorBody(payload, httpStatus);
    }

    throw new FaceAuthApiError("Unexpected error response from backend.", {
      httpStatus,
      code: "INVALID_RESPONSE",
      detail:
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof (payload as { detail: unknown }).detail === "string"
          ? (payload as { detail: string }).detail
          : `HTTP ${httpStatus} from POST ${AUTHENTICATE_PATH}.`,
    });
  }
}

export function createFaceAuthClient(config: FaceAuthClientConfig): FaceAuthClient {
  return new FaceAuthClient(config);
}
