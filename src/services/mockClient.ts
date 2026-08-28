/**
 * Mock transport for the JSON-backend boundary described in
 * docs/05_JSON_목업_재검증_완료_보고서.md and docs/requirements-traceability-design.md §5:
 *   mocks/backend/*.json -> unknown raw payload -> runtime validation -> adapter -> domain -> UI
 *
 * This is the ONLY place that talks to `fetch`. Swapping to a real backend
 * later means replacing this module's implementation, not the screens or
 * the adapters that consume it.
 */
import type { ZodType } from "zod";

export class NotFoundIssue extends Error {
  readonly code = "not-found";
}
export class ServerIssue extends Error {
  readonly code = "server-error";
}
export class ContractIssue extends Error {
  readonly code = "contract-invalid";
}

const SIMULATED_LATENCY_MS = 260;

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/**
 * Fetch a mock JSON fixture, validate it against `schema`, and return the
 * typed, still-raw (snake_case) payload. Callers pass the result through a
 * domain/adapters.ts function before using it in a component.
 */
export async function fetchMock<T>(
  path: string,
  schema: ZodType<T>,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  await delay(SIMULATED_LATENCY_MS, opts.signal);

  let res: Response;
  try {
    res = await fetch(path, { signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ServerIssue("mock fixture unreachable");
  }

  if (res.status === 404) throw new NotFoundIssue(`no fixture at ${path}`);
  if (!res.ok) throw new ServerIssue(`fixture request failed: ${res.status}`);

  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ContractIssue(`fixture at ${path} failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
