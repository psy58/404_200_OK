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

/**
 * Real-backend POST (F14 업무 도우미 등). Same boundary rules as fetchMock:
 * validate with zod before anything else sees the payload. The backend's
 * error envelope is {"error": {"message"}} (docs/API.md) — surface that
 * message so the panel can show a human-readable reason.
 */
export async function postApi<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ServerIssue("백엔드에 연결할 수 없습니다. `npm run dev:backend`와 백엔드 서버(8000)를 확인하세요.");
  }

  if (!res.ok) {
    let message = `요청이 실패했습니다 (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      if (payload?.error?.message) message = payload.error.message;
    } catch {
      /* 본문이 JSON이 아니면 상태 코드 메시지 그대로 */
    }
    if (res.status === 404) throw new NotFoundIssue(message);
    throw new ServerIssue(message);
  }

  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ContractIssue(`response at ${path} failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** 파일 업로드. JSON postApi 와 같은 규칙, 본문만 FormData. */
export async function postFile<T>(path: string, file: File, schema: ZodType<T>): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  let res: Response;
  try {
    res = await fetch(path, { method: "POST", body });
  } catch {
    throw new ServerIssue("백엔드에 연결할 수 없습니다. `npm run dev:backend`와 백엔드 서버(8000)를 확인하세요.");
  }
  if (!res.ok) throw new ServerIssue(`업로드가 실패했습니다 (${res.status})`);

  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ContractIssue(`upload response failed schema validation`);
  return parsed.data;
}
