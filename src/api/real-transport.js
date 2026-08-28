/**
 * API INTEGRATION - OpenAPI-gated real transport
 * User flow: domain service capability -> confirmed operation -> validated DTO.
 * Contract SOT: service OpenAPI/Pydantic/contract test (currently unavailable).
 * Operations/schemas: injected operationId/method/path/parseResponse only; this
 *                     file intentionally embeds no product endpoint or DTO.
 * Adapter: validated network DTO is adapted by the caller before presentation.
 * Auth/AuthZ: cookie/CSRF transport only; server session must reauthorize
 *             school -> Assignment -> object -> property -> action.
 * State/cache: stateless transport; query cache and switch/logout purge live in
 *              cache-keys, request-coordinator and context-lifecycle.
 * Failure UX: RFC9457-like problems map to UiIssue; malformed/offline/schema
 *             responses fail closed and preserve caller-owned form input.
 * Privacy/logging: sends no client-selected authority fields and logs no payload.
 * Verification: tests/api/real-transport.test.js. CONTRACT STATUS: proposed;
 *               BACKEND_CONTRACT_REQUIRED until every operation has a parser.
 */

import { mapProblemToUiIssue, offlineIssue } from "./problem-mapper.js";
import { parseProblemDetails } from "./runtime-schema.js";

const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "user_id", "userId", "role", "school_id", "schoolId", "owner_id", "ownerId",
  "approval_status", "approvalStatus",
]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_CREDENTIALS = new Set(["omit", "same-origin", "include"]);

export class BoundaryConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BoundaryConfigurationError";
    this.code = code;
  }
}

export class ApiTransportError extends Error {
  constructor(issue, status = 0) {
    super(issue.userMessage);
    this.name = "ApiTransportError";
    this.issue = issue;
    this.status = status;
  }
}

function assertNoAuthorityFields(value, path = "body", ancestors = new WeakSet()) {
  if (value === null || typeof value !== "object") return;
  if (ancestors.has(value)) {
    throw new BoundaryConfigurationError("REQUEST_VALUE_CIRCULAR", `${path} cannot contain a circular reference`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoAuthorityFields(item, `${path}[${index}]`, ancestors));
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_AUTHORITY_FIELDS.has(key)) {
        throw new BoundaryConfigurationError("CLIENT_AUTHORITY_FIELD_FORBIDDEN", `${path}.${key} cannot select the authorization principal`);
      }
      assertNoAuthorityFields(item, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function responseIssue(code, title, userMessage, retryable = false) {
  return Object.freeze({ code, title, userMessage, retryable, recoveryAction: retryable ? "retry" : "contact-support" });
}

function assertScalarQuery(query) {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
      throw new BoundaryConfigurationError("QUERY_VALUE_INVALID", `query.${key} must be a finite scalar value`);
    }
  }
}

function fillPath(pathTemplate, pathParams) {
  if (typeof pathTemplate !== "string"
    || !pathTemplate.startsWith("/")
    || pathTemplate.startsWith("//")
    || pathTemplate.includes("\\")
    || /[\u0000-\u001F\u007F]/.test(pathTemplate)) {
    throw new BoundaryConfigurationError("OPENAPI_PATH_INVALID", "Operation path must be a safe same-origin absolute path");
  }
  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = pathParams?.[key];
    if (value === undefined || value === null || value === "" || !["string", "number"].includes(typeof value)) {
      throw new BoundaryConfigurationError("OPENAPI_PATH_PARAMETER_MISSING", `Missing path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
  if (/[{}]/.test(path)) throw new BoundaryConfigurationError("OPENAPI_PATH_TEMPLATE_INVALID", "Operation path has an invalid parameter template");
  return path;
}

export function createRealTransport(config) {
  if (!config?.openApiRevision || !config?.baseUrl || !config?.operations) {
    throw new BoundaryConfigurationError(
      "BACKEND_CONTRACT_REQUIRED",
      "A confirmed OpenAPI revision, base URL and operation map are required before real requests are enabled",
    );
  }
  let baseUrl;
  try {
    baseUrl = new URL(config.baseUrl, globalThis.location?.origin ?? "http://localhost");
  } catch {
    throw new BoundaryConfigurationError("API_BASE_URL_INVALID", "API base URL must be a valid URL");
  }
  if (!new Set(["http:", "https:"]).has(baseUrl.protocol)) {
    throw new BoundaryConfigurationError("API_BASE_URL_SCHEME_INVALID", "Only http/https API base URLs are allowed");
  }
  if (baseUrl.username || baseUrl.password) {
    throw new BoundaryConfigurationError("API_BASE_URL_CREDENTIALS_FORBIDDEN", "API base URL cannot contain embedded credentials");
  }
  const credentials = config.credentials ?? "same-origin";
  if (!ALLOWED_CREDENTIALS.has(credentials)) {
    throw new BoundaryConfigurationError("CREDENTIALS_MODE_INVALID", "Unsupported fetch credentials mode");
  }
  if (config.csrfToken !== undefined && typeof config.csrfToken !== "function") {
    throw new BoundaryConfigurationError("CSRF_TOKEN_PROVIDER_INVALID", "csrfToken must be a function when configured");
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new BoundaryConfigurationError("FETCH_UNAVAILABLE", "fetch implementation is required");

  return Object.freeze({
    contractStatus: "CONFIRMED",
    revision: config.openApiRevision,
    async invoke(capability, request = {}) {
      const operation = config.operations[capability];
      if (!operation?.operationId || !operation?.method || !operation?.path || typeof operation.parseResponse !== "function") {
        throw new BoundaryConfigurationError("BACKEND_CONTRACT_REQUIRED", `No confirmed OpenAPI operation for capability: ${capability}`);
      }
      const method = String(operation.method).toUpperCase();
      if (!ALLOWED_METHODS.has(method)) {
        throw new BoundaryConfigurationError("OPENAPI_METHOD_INVALID", `Unsupported HTTP method for capability: ${capability}`);
      }
      assertNoAuthorityFields(request.body);
      assertNoAuthorityFields(request.query, "query");
      assertNoAuthorityFields(request.pathParams, "pathParams");
      assertScalarQuery(request.query);
      if (["GET", "DELETE"].includes(method) && request.body !== undefined) {
        throw new BoundaryConfigurationError("REQUEST_BODY_NOT_ALLOWED", `${method} capability cannot send a request body`);
      }
      if (request.idempotencyKey !== undefined && (typeof request.idempotencyKey !== "string" || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 200)) {
        throw new BoundaryConfigurationError("IDEMPOTENCY_KEY_INVALID", "Idempotency key must be 1-200 characters");
      }
      if (request.expectedVersion !== undefined && (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1)) {
        throw new BoundaryConfigurationError("EXPECTED_VERSION_INVALID", "Expected version must be a positive integer");
      }
      const url = new URL(fillPath(operation.path, request.pathParams), baseUrl);
      if (url.origin !== baseUrl.origin) {
        throw new BoundaryConfigurationError("OPENAPI_PATH_ORIGIN_INVALID", "Operation path cannot change the configured API origin");
      }
      for (const [key, value] of Object.entries(request.query ?? {})) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      }
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          credentials,
          redirect: "error",
          signal: request.signal,
          headers: {
            Accept: "application/json, application/problem+json",
            ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : {}),
            ...(request.expectedVersion === undefined ? {} : { "If-Match": String(request.expectedVersion) }),
            ...(config.csrfToken ? { [config.csrfHeaderName ?? "X-CSRF-Token"]: config.csrfToken() } : {}),
          },
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        });
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        throw new ApiTransportError(offlineIssue());
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        if (!contentType.includes("application/problem+json") && !contentType.includes("application/json")) {
          throw new ApiTransportError({
            code: "UNSTRUCTURED_BACKEND_ERROR",
            title: "서버 오류를 확인할 수 없습니다",
            userMessage: "입력은 유지됩니다. 잠시 후 다시 시도하세요.",
            retryable: response.status >= 500,
            recoveryAction: response.status >= 500 ? "retry" : "contact-support",
          }, response.status);
        }
        let problem;
        try {
          problem = parseProblemDetails(await response.json());
        } catch {
          throw new ApiTransportError(responseIssue(
            "PROBLEM_RESPONSE_INVALID",
            "오류 응답 형식을 확인할 수 없습니다",
            "입력은 유지됩니다. 지원 번호와 함께 다시 시도해 주세요.",
            response.status >= 500,
          ), response.status);
        }
        throw new ApiTransportError(mapProblemToUiIssue(problem), response.status);
      }
      if (operation.responseKind === "empty" && response.status === 204) {
        try {
          return await operation.parseResponse(undefined);
        } catch {
          throw new ApiTransportError(responseIssue(
            "RESPONSE_SCHEMA_INVALID",
            "응답 구조를 확인할 수 없습니다",
            "검증되지 않은 응답은 화면에 반영하지 않았습니다.",
          ), response.status);
        }
      }
      if (!contentType.includes("application/json")) {
        throw new ApiTransportError({
          code: "RESPONSE_CONTENT_TYPE_INVALID",
          title: "응답 형식을 확인할 수 없습니다",
          userMessage: "안전하지 않은 응답은 사용하지 않았습니다.",
          retryable: false,
          recoveryAction: "contact-support",
        }, response.status);
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ApiTransportError(responseIssue(
          "RESPONSE_JSON_INVALID",
          "응답 내용을 읽을 수 없습니다",
          "검증되지 않은 응답은 화면에 반영하지 않았습니다.",
        ), response.status);
      }
      try {
        return await operation.parseResponse(payload);
      } catch {
        throw new ApiTransportError(responseIssue(
          "RESPONSE_SCHEMA_INVALID",
          "응답 구조를 확인할 수 없습니다",
          "검증되지 않은 응답은 화면에 반영하지 않았습니다.",
        ), response.status);
      }
    },
  });
}
