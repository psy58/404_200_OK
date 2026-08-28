/**
 * Coordinates cancellable latest-request-wins reads without coupling to React.
 *
 * A user/school/Assignment switch must call cancelAll() before a new context is
 * installed. Stale responses reject instead of mutating the new screen.
 */

export class StaleResponseError extends Error {
  constructor(scope) {
    super(`A newer request replaced scope: ${scope}`);
    this.name = "StaleResponseError";
    this.code = "STALE_RESPONSE_IGNORED";
    this.scope = scope;
  }
}

export function createRequestCoordinator() {
  const active = new Map();
  let generation = 0;

  return Object.freeze({
    async run(scope, execute) {
      if (typeof scope !== "string" || scope.length === 0) throw new TypeError("scope is required");
      if (typeof execute !== "function") throw new TypeError("execute is required");
      active.get(scope)?.controller.abort();
      const controller = new AbortController();
      const token = ++generation;
      active.set(scope, { controller, token });
      try {
        const value = await execute(controller.signal);
        if (active.get(scope)?.token !== token) throw new StaleResponseError(scope);
        return value;
      } finally {
        if (active.get(scope)?.token === token) active.delete(scope);
      }
    },

    cancel(scope) {
      active.get(scope)?.controller.abort();
      active.delete(scope);
    },

    cancelAll() {
      for (const request of active.values()) request.controller.abort();
      active.clear();
      generation += 1;
    },

    pendingScopes() {
      return Object.freeze([...active.keys()]);
    },
  });
}

export function createSessionMemoryCache() {
  const values = new Map();
  let contextFingerprint = null;

  const fingerprint = (context) => {
    const parts = [context?.userId, context?.schoolId, context?.assignmentId, context?.sessionEpoch];
    if (parts.some((part) => typeof part !== "string" || part.length === 0)) {
      throw new TypeError("Complete user/school/assignment/session context is required");
    }
    return JSON.stringify(parts);
  };

  return Object.freeze({
    bind(context) {
      const next = fingerprint(context);
      if (contextFingerprint !== null && contextFingerprint !== next) values.clear();
      contextFingerprint = next;
    },

    get(key) {
      return values.get(JSON.stringify(key));
    },

    set(key, value) {
      if (contextFingerprint === null) throw new Error("Cache context must be bound before use");
      values.set(JSON.stringify(key), value);
    },

    clear() {
      values.clear();
      contextFingerprint = null;
    },

    size() {
      return values.size;
    },
  });
}
