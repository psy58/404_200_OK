/**
 * API INTEGRATION - session and Assignment context lifecycle
 * User flow: bootstrap/switch/logout -> cancel requests -> purge cache -> install.
 * Contract SOT: proposed SessionContextVM; service operationIds still unavailable.
 * Auth/state: complete user/school/Assignment/sessionEpoch context is required;
 *             the server remains authoritative for permission decisions.
 * Failure/rollback: previous context is removed before transition and is never
 *                   restored after failure or a late stale response.
 * Privacy/logging: cached user data is purged on every context boundary.
 * Verification: tests/api/context-lifecycle.test.js.
 */

export class ContextLifecycleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ContextLifecycleError";
    this.code = code;
  }
}

function validateSession(session) {
  const context = session?.context;
  if (session?.status !== "ready"
    || !context?.userId
    || !context?.schoolId
    || !context?.assignmentId
    || !context?.sessionEpoch
    || session.activeAssignmentId !== context.assignmentId
    || !session.assignments?.some((assignment) => assignment.id === context.assignmentId && assignment.active)) {
    throw new ContextLifecycleError("SESSION_CONTEXT_INVALID", "Session must contain one active, complete authorization context");
  }
  return session;
}

/** @param {{ service?: any, coordinator?: any, cache?: any }} [options] */
export function createContextLifecycle(options = {}) {
  const { service, coordinator, cache } = options;
  if (!service || typeof service.getSession !== "function" || typeof service.setActiveAssignment !== "function" || typeof service.logout !== "function") {
    throw new TypeError("service with session, assignment and logout capabilities is required");
  }
  if (!coordinator || typeof coordinator.cancelAll !== "function") throw new TypeError("request coordinator is required");
  if (!cache || typeof cache.clear !== "function" || typeof cache.bind !== "function") throw new TypeError("context-aware cache is required");

  let status = "idle";
  let currentSession = null;
  let transitionGeneration = 0;

  const purge = () => {
    coordinator.cancelAll();
    cache.clear();
    currentSession = null;
  };

  const beginTransition = (nextStatus) => {
    purge();
    const token = ++transitionGeneration;
    status = nextStatus;
    return token;
  };

  const install = (session, token) => {
    if (token !== transitionGeneration) {
      throw new ContextLifecycleError("STALE_CONTEXT_TRANSITION", "A newer context transition replaced this response");
    }
    const validated = validateSession(session);
    cache.bind(validated.context);
    currentSession = validated;
    status = "ready";
    return validated;
  };

  return Object.freeze({
    async initialize(options) {
      const token = beginTransition("loading");
      try {
        return install(await service.getSession(options), token);
      } catch (error) {
        if (token === transitionGeneration) status = "error";
        throw error;
      }
    },

    async switchAssignment(assignmentId, mutation) {
      if (status !== "ready" || currentSession === null) {
        throw new ContextLifecycleError("SESSION_NOT_READY", "Session must be ready before switching Assignment");
      }
      if (typeof assignmentId !== "string" || assignmentId.length === 0) {
        throw new ContextLifecycleError("ASSIGNMENT_ID_REQUIRED", "Assignment id is required");
      }
      const token = beginTransition("switching");
      try {
        return install(await service.setActiveAssignment(assignmentId, mutation), token);
      } catch (error) {
        if (token === transitionGeneration) status = "error";
        throw error;
      }
    },

    async logout(options) {
      const token = beginTransition("logging-out");
      try {
        await service.logout(options);
      } finally {
        if (token === transitionGeneration) status = "logged-out";
      }
    },

    snapshot() {
      return Object.freeze({
        status,
        session: currentSession,
        context: currentSession?.context ?? null,
      });
    },
  });
}
