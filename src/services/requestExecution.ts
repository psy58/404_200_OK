import { createRequestCoordinator } from "@/api/request-coordinator.js";

const coordinator = createRequestCoordinator();

function combineSignals(first: AbortSignal, second?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener("abort", abort, { once: true });
  second?.addEventListener("abort", abort, { once: true });
  if (first.aborted || second?.aborted) controller.abort();
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", abort);
      second?.removeEventListener("abort", abort);
    },
  };
}

export async function runApiRequest<T>(
  scope: string,
  callerSignal: AbortSignal | undefined,
  execute: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return coordinator.run(scope, async (coordinatorSignal) => {
    const combined = combineSignals(coordinatorSignal, callerSignal);
    try {
      return await execute(combined.signal);
    } finally {
      combined.cleanup();
    }
  });
}

export function cancelAllApiRequests(): void {
  coordinator.cancelAll();
}

export function requestScope(parts: readonly (string | number | undefined)[]): string {
  return parts.filter((part) => part !== undefined).join(":");
}

export function createIdempotencyKey(operation: string): string {
  return `${operation}:${crypto.randomUUID()}`;
}
