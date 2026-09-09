/**
 * Face Auth HTTP client (SDK → Debian backend).
 *
 * Architecture
 * ------------
 *   FaceAuthSDK.authenticate() / register() / kioskAdmin*
 *         ↓
 *   FaceAuthClient                              ← this module
 *         ↓
 *   POST {apiBaseUrl}/authenticate | /register | /kiosk/admin-*
 *         ↓
 *   Typed result OR FaceAuthApiError
 *
 * System boundary
 * ---------------
 * - Owns HTTPS transport only (JSON + FormData + fetch).
 * - Does NOT open the camera or run liveness (FaceAuthSDK).
 * - Wrong face on auth is HTTP 200 with authenticated=false (not thrown).
 * - Path A register success is HTTP 201 PENDING — does not log user into Mendix.
 * - Path B kiosk admin enroll is HTTP 201 ACTIVE — worker may authenticate immediately.
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
import type {
  KioskAdminEnrollRequest,
  KioskAdminEnrollResult,
  KioskAdminErrorBody,
  KioskAdminErrorCode,
  KioskAdminLoginRequest,
  KioskAdminLoginResponse,
  KioskAdminLogoutResult,
} from "../types/kioskAdmin.types";
import {
  KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD,
  KIOSK_ADMIN_ENROLL_FULL_NAME_FIELD,
  KIOSK_ADMIN_ENROLL_IMAGE_FIELD,
  KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD,
  KIOSK_ADMIN_ENROLL_PATH,
  KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD,
  KIOSK_ADMIN_LOGIN_PATH,
  KIOSK_ADMIN_LOGOUT_PATH,
  KIOSK_ADMIN_SESSION_HEADER,
  isKioskAdminEnrollResult,
  isKioskAdminErrorBody,
  isKioskAdminLoginResponse,
  isKioskAdminLogoutResult,
} from "../types/kioskAdmin.types";

/**
 * Fetch with timeout via AbortController — do not use AbortSignal.timeout();
 * many Android kiosk WebViews lack it or expose a broken polyfill.
 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function networkErrorDetail(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `Request timed out after ${Math.round(timeoutMs / 1000)}s.`;
    }
    return error.message;
  }
  return "Network request failed.";
}

/** Client-only failure codes (not returned by Debian API). */
export type FaceAuthClientErrorCode =
  | AuthErrorCode
  | RegistrationErrorCode
  | KioskAdminErrorCode
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
export type {
  KioskAdminEnrollRequest,
  KioskAdminEnrollResult,
  KioskAdminLoginRequest,
  KioskAdminLoginResponse,
  KioskAdminLogoutResult,
};

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

  static fromKioskAdminErrorBody(
    body: KioskAdminErrorBody,
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

  get kioskAdminLoginUrl(): string {
    return `${this.apiBaseUrl}${KIOSK_ADMIN_LOGIN_PATH}`;
  }

  get kioskAdminEnrollUrl(): string {
    return `${this.apiBaseUrl}${KIOSK_ADMIN_ENROLL_PATH}`;
  }

  get kioskAdminLogoutUrl(): string {
    return `${this.apiBaseUrl}${KIOSK_ADMIN_LOGOUT_PATH}`;
  }

  /** GET /plants — active plants for Register UI dropdown. */
  async listPlants(): Promise<PlantListResponse> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchFn,
        this.plantsUrl,
        { method: "GET" },
        this.timeoutMs,
      );
    } catch (error) {
      const detail = networkErrorDetail(error, this.timeoutMs);
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
    const fullName = request.fullName.trim() || employeeId;
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

  /**
   * POST /kiosk/admin-login — admin operator employeeId + password.
   *
   * Returns session token for enroll/logout. Does not enroll anyone.
   */
  async kioskAdminLogin(
    request: KioskAdminLoginRequest,
  ): Promise<KioskAdminLoginResponse> {
    const employeeId = request.employeeId.trim();
    const password = request.password;
    if (!employeeId || !password) {
      throw new FaceAuthApiError("Admin employeeId and password are required.", {
        httpStatus: 0,
        code: "INVALID_CREDENTIALS",
        detail: "Admin employeeId and password are required.",
      });
    }

    const response = await this.postJson(this.kioskAdminLoginUrl, {
      employeeId,
      password,
    });
    return this.parseKioskAdminLoginResponse(response);
  }

  /**
   * POST /kiosk/admin-enroll — enroll one target worker (fresh JPEG).
   *
   * Requires admin session token. plantId is assigned server-side from session.
   * Does NOT send plantId in the multipart body.
   */
  async kioskAdminEnroll(
    adminSessionToken: string,
    request: KioskAdminEnrollRequest,
  ): Promise<KioskAdminEnrollResult> {
    const token = adminSessionToken.trim();
    if (!token) {
      throw new FaceAuthApiError("Admin session token is required.", {
        httpStatus: 0,
        code: "UNAUTHORIZED",
        detail: "Admin session token is required for kiosk enroll.",
      });
    }

    const employeeId = request.employeeId.trim();
    const fullName = request.fullName.trim() || employeeId;

    const { blob, filename } = this.resolveImagePayload(
      request.image,
      request.filename,
    );

    const form = new FormData();
    form.append(KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD, employeeId);
    form.append(KIOSK_ADMIN_ENROLL_FULL_NAME_FIELD, fullName);
    form.append(KIOSK_ADMIN_ENROLL_IMAGE_FIELD, blob, filename);

    const kioskId = request.kioskId?.trim();
    if (kioskId) {
      form.append(KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD, kioskId);
    }

    const sessionId = request.sessionId?.trim();
    if (sessionId) {
      form.append(KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD, sessionId);
    }

    const response = await this.postMultipart(this.kioskAdminEnrollUrl, form, {
      [KIOSK_ADMIN_SESSION_HEADER]: token,
    });
    return this.parseKioskAdminEnrollResponse(response);
  }

  /**
   * POST /kiosk/admin-logout — invalidate admin kiosk session.
   */
  async kioskAdminLogout(
    adminSessionToken: string,
  ): Promise<KioskAdminLogoutResult> {
    const token = adminSessionToken.trim();
    const response = await this.postJson(
      this.kioskAdminLogoutUrl,
      {},
      token ? { [KIOSK_ADMIN_SESSION_HEADER]: token } : undefined,
    );
    return this.parseKioskAdminLogoutResponse(response);
  }

  private async postJson(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<Response> {
    try {
      return await fetchWithTimeout(
        this.fetchFn,
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(body),
        },
        this.timeoutMs,
      );
    } catch (error) {
      const detail = networkErrorDetail(error, this.timeoutMs);
      throw new FaceAuthApiError(detail, {
        httpStatus: 0,
        code: "NETWORK_ERROR",
        detail,
      });
    }
  }

  private async postMultipart(
    url: string,
    form: FormData,
    headers?: Record<string, string>,
  ): Promise<Response> {
    try {
      return await fetchWithTimeout(
        this.fetchFn,
        url,
        {
          method: "POST",
          headers,
          body: form,
        },
        this.timeoutMs,
      );
    } catch (error) {
      const detail = networkErrorDetail(error, this.timeoutMs);
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

  private async parseKioskAdminLoginResponse(
    response: Response,
  ): Promise<KioskAdminLoginResponse> {
    const httpStatus = response.status;
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from POST ${KIOSK_ADMIN_LOGIN_PATH}.`,
      });
    }

    if (response.ok && isKioskAdminLoginResponse(payload)) {
      return payload;
    }

    if (isKioskAdminErrorBody(payload)) {
      throw FaceAuthApiError.fromKioskAdminErrorBody(payload, httpStatus);
    }

    throw this.unexpectedErrorResponse(payload, httpStatus, KIOSK_ADMIN_LOGIN_PATH);
  }

  private async parseKioskAdminEnrollResponse(
    response: Response,
  ): Promise<KioskAdminEnrollResult> {
    const httpStatus = response.status;
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from POST ${KIOSK_ADMIN_ENROLL_PATH}.`,
      });
    }

    if (httpStatus === 201 && isKioskAdminEnrollResult(payload)) {
      return payload;
    }

    if (isKioskAdminErrorBody(payload)) {
      throw FaceAuthApiError.fromKioskAdminErrorBody(payload, httpStatus);
    }

    if (response.ok && !isKioskAdminEnrollResult(payload)) {
      throw new FaceAuthApiError("Backend returned an invalid success body.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail:
          "Missing success, requestId, employeeId, plantId, enrollmentStatus, or message.",
      });
    }

    throw this.unexpectedErrorResponse(payload, httpStatus, KIOSK_ADMIN_ENROLL_PATH);
  }

  private async parseKioskAdminLogoutResponse(
    response: Response,
  ): Promise<KioskAdminLogoutResult> {
    const httpStatus = response.status;
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new FaceAuthApiError("Backend returned a non-JSON response.", {
        httpStatus,
        code: "INVALID_RESPONSE",
        detail: `Expected JSON from POST ${KIOSK_ADMIN_LOGOUT_PATH}.`,
      });
    }

    if (response.ok && isKioskAdminLogoutResult(payload)) {
      return payload;
    }

    if (isKioskAdminErrorBody(payload)) {
      throw FaceAuthApiError.fromKioskAdminErrorBody(payload, httpStatus);
    }

    throw this.unexpectedErrorResponse(payload, httpStatus, KIOSK_ADMIN_LOGOUT_PATH);
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
