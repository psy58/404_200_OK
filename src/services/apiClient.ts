/**
 * API INTEGRATION - app-wide mock/real service boundary
 * User flow: bootstrap -> session -> feature controller -> capability service.
 * Contract SOT: service OpenAPI/Pydantic/contract test (unavailable) and the
 *               proposed UI_API_BOUNDARY_V2 presentation contract.
 * Operations: no operationId/path is guessed; real mode throws
 *             BACKEND_CONTRACT_REQUIRED before network I/O.
 * Adapter/state: services share FrontendApiService; feature services own V2 to
 *                design adapters and principal-scoped query keys.
 * Auth/privacy: future cookie/CSRF settings come from the confirmed backend;
 *               no credential, payload or internal endpoint is logged here.
 * Verification: tests/api/service-factory.test.js; mock is explicit,
 *               session-only and forbidden in production.
 */
import { createFrontendApiService } from "@/api/service-factory.js";
import type { FrontendApiService } from "@/api/ui-api-boundary-v2";
import { createBackendApi } from "@/api/backend-api";

let servicePromise: Promise<FrontendApiService> | undefined;

function runtimeEnvironment(): "development" | "test" | "production" {
  if (import.meta.env.PROD) return "production";
  return import.meta.env.MODE === "test" ? "test" : "development";
}

function createRealApi(): FrontendApiService {
  return createBackendApi();
}

async function createMockApi(): Promise<FrontendApiService> {
  const { createPreviewApi } = await import("./mockApiFactory");
  return createPreviewApi();
}

export function getFrontendApiService(): Promise<FrontendApiService> {
  if (!servicePromise) {
    const environment = runtimeEnvironment();
    const mode = import.meta.env.VITE_API_MODE ?? "real";
    servicePromise = createFrontendApiService({
      mode,
      runtimeEnvironment: environment,
      allowMock: environment !== "production" && import.meta.env.VITE_ALLOW_MOCK === "true",
      createMock: createMockApi,
      createReal: createRealApi,
    });
  }
  return servicePromise;
}
