export class StaleResponseError extends Error {
  readonly code: "STALE_RESPONSE_IGNORED";
  readonly scope: string;
}

export interface RequestCoordinator {
  run<T>(scope: string, execute: (signal: AbortSignal) => Promise<T>): Promise<T>;
  cancel(scope: string): void;
  cancelAll(): void;
  pendingScopes(): readonly string[];
}

export function createRequestCoordinator(): RequestCoordinator;
