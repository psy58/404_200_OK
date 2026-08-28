import type { FrontendApiService, RequestContext, UiIssue } from "./ui-api-boundary-v2";

export class MockApiError extends Error {
  readonly issue: UiIssue;
  readonly status: number;
}

export function createMemoryFixtureLoader(
  fixtures: Readonly<Record<string, unknown>>,
): (name: string, options?: { readonly signal?: AbortSignal }) => Promise<unknown>;

export function createMockApi(options: {
  readonly fixtureLoader: (name: string, options?: { readonly signal?: AbortSignal }) => Promise<unknown>;
  readonly latencyMs?: number;
}): Promise<FrontendApiService & {
  readonly contractStatus: "MOCK_ONLY";
  readonly persistence: "session-only";
  getActiveContext(): RequestContext;
}>;
