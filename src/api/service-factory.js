/**
 * API INTEGRATION - application service mode boundary
 * User flow: app bootstrap -> explicit mock preview or confirmed real service.
 * Contract SOT: api-integration/frontend-api-map.md; app entry wiring pending.
 * Auth/state: no implicit fallback; production only accepts CONFIRMED service.
 * Failure UX: configuration errors stop startup before any data is displayed.
 * Privacy/logging: no base URL, credentials, token or payload is stored here.
 * Verification: tests/api/service-factory.test.js. MOCK ONLY requires explicit
 *               non-production opt-in; production accidental mock is blocked.
 */

const RUNTIME_ENVIRONMENTS = new Set(["development", "test", "production"]);

export class ServiceModeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ServiceModeError";
    this.code = code;
  }
}

function requireFactory(factory, name) {
  if (typeof factory !== "function") throw new ServiceModeError("SERVICE_FACTORY_REQUIRED", `${name} factory is required`);
  return factory;
}

function assertBoundary(service, expectedStatus) {
  if (!service || service.contractStatus !== expectedStatus) {
    throw new ServiceModeError(
      "SERVICE_BOUNDARY_MISMATCH",
      `Service must expose contractStatus=${expectedStatus}`,
    );
  }
  return service;
}

/**
 * @param {{
 *   mode?: "mock" | "real",
 *   runtimeEnvironment?: "development" | "test" | "production",
 *   allowMock?: boolean,
 *   createMock?: () => Promise<any> | any,
 *   createReal?: () => Promise<any> | any
 * }} [options]
 */
export async function createFrontendApiService(options = {}) {
  const { mode, runtimeEnvironment, allowMock = false, createMock, createReal } = options;
  if (!RUNTIME_ENVIRONMENTS.has(runtimeEnvironment)) {
    throw new ServiceModeError("RUNTIME_ENVIRONMENT_REQUIRED", "runtimeEnvironment must be development, test or production");
  }

  if (mode === "mock") {
    if (runtimeEnvironment === "production") {
      throw new ServiceModeError("PRODUCTION_MOCK_FORBIDDEN", "MOCK_ONLY service cannot start in production");
    }
    if (allowMock !== true) {
      throw new ServiceModeError("MOCK_OPT_IN_REQUIRED", "Preview/test mock mode requires an explicit opt-in");
    }
    return assertBoundary(await requireFactory(createMock, "mock")(), "MOCK_ONLY");
  }

  if (mode === "real") {
    return assertBoundary(await requireFactory(createReal, "real")(), "CONFIRMED");
  }

  throw new ServiceModeError("SERVICE_MODE_REQUIRED", "mode must be explicitly set to mock or real");
}
