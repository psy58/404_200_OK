import type { FrontendApiService } from "./ui-api-boundary-v2";

export class ServiceModeError extends Error {
  constructor(code: string, message: string);
  readonly code: string;
}

export function createFrontendApiService(options: {
  readonly mode: "mock" | "real";
  readonly runtimeEnvironment: "development" | "test" | "production";
  readonly allowMock?: boolean;
  readonly createMock?: () => Promise<FrontendApiService> | FrontendApiService;
  readonly createReal?: () => Promise<FrontendApiService> | FrontendApiService;
}): Promise<FrontendApiService>;
