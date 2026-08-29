/**
 * Face Auth HTTP client (SDK → Debian backend).
 *
 * Architecture
 * ------------
 *   FaceAuthSDK.authenticate() / register()
 *         ↓
 *   FaceAuthClient.authenticate() | register()     ← this module
 *         ↓
 *   POST {apiBaseUrl}/authenticate  |  /register
 *         multipart: employee_id + image (JPEG)
 *         ↓
 *   AuthenticateResult (200) | RegisterResult (201)  OR  FaceAuthApiError
 *
 * System boundary
 * ---------------
 * - Owns HTTPS transport only (FormData + fetch).
 * - Does NOT open the camera or run liveness (FaceAuthSDK).
 * - Wrong face on auth is HTTP 200 with authenticated=false (not thrown).
 * - Register success is HTTP 201 PENDING — does not log user into Mendix.
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
import type {
  PlantListResponse,
  RegisterRequest,
  RegisterResult,
  RegistrationErrorBody,
  RegistrationErrorCode,
} from "../types/registration.types";
import {
  PLANTS_PATH,
  REGISTER_EMPLOYEE_ID_FIELD,
  REGISTER_FULL_NAME_FIELD,
  REGISTER_IMAGE_FIELD,
  REGISTER_KIOSK_ID_FIELD,
  REGISTER_PATH,
  REGISTER_PLANT_ID_FIELD,
  REGISTER_SESSION_ID_FIELD,
  isPlantListResponse,
  isRegisterResult,
  isRegistrationErrorBody,
} from "../types/registration.types";

/** Client-only failure codes (not returned by Debian API). */
export type FaceAuthClientErrorCode =
  | AuthErrorCode
  | RegistrationErrorCode
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

export type { RegisterRequest, RegisterResult };

/**
 * Thrown when POST /authenticate or POST /register fails (4xx/5xx) or the
 * client cannot complete the request.
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

  /** True when the server returned a structured error body. */
  get isServerError(): boolean {
    return (
      this.code !== "NETWORK_ERROR" &&
      this.code !== "INVALID_RESPONSE" &&
      this.code !== "API_NOT_CONFIGURED"
    );
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

  static fromRegistrationErrorBody(
    body: RegistrationErrorBody,
    httpStatus: number,
  ): FaceAuthApiError {
    return new FaceAuthApiError(body.detail, {
      httpStatus,
      code: body.code,
      detail: body.detail,
    });
  }
}

/** Duck-type check — avoids instanceof failures when bundlers duplicate the class. */
export function isFaceAuthApiError(error: unknown): error is FaceAuthApiError {
  return (
    error instanceof FaceAuthApiError ||
    (error instanceof Error &&
      error.name === "FaceAuthApiError" &&
      typeof (error as FaceAuthApiError).code === "string" &&
      typeof (error as FaceAuthApiError).httpStatus === "number" &&
      typeof (error as FaceAuthApiError).detail === "string")
  );
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

  get registerUrl(): string {
    return `${this.apiBaseUrl}${REGISTER_PATH}`;
  }

  get plantsUrl(): string {
    return `${this.apiBaseUrl}${PLANTS_PATH}`;
  }

  /** GET /plants — active plants for Register UI dropdown. */
  async listPlants(): Promise<PlantListResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(this.plantsUrl, {
        method: "GET",
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

    const httpStatus = response.status;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from GET ${PLANTS_PATH}.`,
      });
    }

    if (response.ok && isPlantListResponse(payload)) {
      return payload;
    }

    throw new FaceAuthApiError("Failed to load plant list.", {
      httpStatus,
      code: "INVALID_RESPONSE",
      detail: `GET ${PLANTS_PATH} failed.`,
    });
  }

  /**
   * POST /authenticate — Employee ID + one JPEG still.
   *
   * @returns Full backend decision (including score/threshold for harness UI).
   * @throws FaceAuthApiError on transport or pipeline failures (not wrong face).
   */
  async authenticate(request: AuthenticateRequest): Promise<AuthenticateResult> {
    const employeeId = request.employeeId.trim();
    const { blob, filename } = this.resolveImagePayload(
      request.image,
      request.filename,
    );

    const form = new FormData();
    form.append(AUTHENTICATE_EMPLOYEE_ID_FIELD, employeeId);
    form.append(AUTHENTICATE_IMAGE_FIELD, blob, filename);

    const response = await this.postMultipart(this.authenticateUrl, form);
    return this.parseAuthenticateResponse(response);
  }

  /**
   * POST /register — Employee ID + JPEG (normally reused from authenticate).
   *
   * @returns PENDING registration confirmation (HTTP 201).
   * @throws FaceAuthApiError on transport or validation failures.
   */
  async register(request: RegisterRequest): Promise<RegisterResult> {
    const employeeId = request.employeeId.trim();
    const plantId = request.plantId.trim();
    const fullName = request.fullName.trim();
    const { blob, filename } = this.resolveImagePayload(
      request.image,
      request.filename,
    );

    const form = new FormData();
    form.append(REGISTER_EMPLOYEE_ID_FIELD, employeeId);
    form.append(REGISTER_PLANT_ID_FIELD, plantId);
    form.append(REGISTER_FULL_NAME_FIELD, fullName);
    form.append(REGISTER_IMAGE_FIELD, blob, filename);

    const kioskId = request.kioskId?.trim();
    if (kioskId) {
      form.append(REGISTER_KIOSK_ID_FIELD, kioskId);
    }

    const sessionId = request.sessionId?.trim();
    if (sessionId) {
      form.append(REGISTER_SESSION_ID_FIELD, sessionId);
    }

    const response = await this.postMultipart(this.registerUrl, form);
    return this.parseRegisterResponse(response);
  }

  private async postMultipart(url: string, form: FormData): Promise<Response> {
    try {
      return await this.fetchFn(url, {
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
          detail:
            "Missing employeeId, authenticated, score, threshold, or message.",
        });
      }
      return payload;
    }

    if (isAuthErrorBody(payload)) {
      throw FaceAuthApiError.fromAuthErrorBody(payload, httpStatus);
    }

    throw this.unexpectedErrorResponse(payload, httpStatus, AUTHENTICATE_PATH);
  }

  private async parseRegisterResponse(response: Response): Promise<RegisterResult> {
    const httpStatus = response.status;
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from POST ${REGISTER_PATH}.`,
      });
    }

    if (httpStatus === 201 && isRegisterResult(payload)) {
      return payload;
    }

    if (isRegistrationErrorBody(payload)) {
      throw FaceAuthApiError.fromRegistrationErrorBody(payload, httpStatus);
    }

    if (response.ok && !isRegisterResult(payload)) {
      throw new FaceAuthApiError("Backend returned an invalid success body.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: "Missing requestId, employeeId, plantId, status, source, or message.",
      });
    }

    throw this.unexpectedErrorResponse(payload, httpStatus, REGISTER_PATH);
  }

  private unexpectedErrorResponse(
    payload: unknown,
    httpStatus: number,
    path: string,
  ): FaceAuthApiError {
    return new FaceAuthApiError("Unexpected error response from backend.", {
      httpStatus,
      code: "INVALID_RESPONSE",
      detail:
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof (payload as { detail: unknown }).detail === "string"
          ? (payload as { detail: string }).detail
          : `HTTP ${httpStatus} from POST ${path}.`,
    });
  }
}

export function createFaceAuthClient(config: FaceAuthClientConfig): FaceAuthClient {
  return new FaceAuthClient(config);
}
