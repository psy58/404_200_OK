import assert from "node:assert/strict";
import test from "node:test";

import { ContextLifecycleError, createContextLifecycle } from "../../src/api/context-lifecycle.js";
import { createRequestCoordinator, createSessionMemoryCache } from "../../src/api/request-coordinator.js";

function session(assignmentId = "a1") {
  return Object.freeze({
    status: "ready",
    activeAssignmentId: assignmentId,
    context: Object.freeze({ userId: "u1", schoolId: "s1", assignmentId, sessionEpoch: "e1" }),
    assignments: Object.freeze([
      Object.freeze({ id: "a1", active: assignmentId === "a1" }),
      Object.freeze({ id: "a2", active: assignmentId === "a2" }),
    ]),
  });
}

test("initialization installs a complete context and binds the cache", async () => {
  const cache = createSessionMemoryCache();
  const lifecycle = createContextLifecycle({
    service: { getSession: async () => session(), setActiveAssignment: async () => session("a2"), logout: async () => {} },
    coordinator: createRequestCoordinator(),
    cache,
  });
  await lifecycle.initialize();
  cache.set(["home"], { private: true });
  assert.equal(lifecycle.snapshot().context.assignmentId, "a1");
  assert.equal(cache.size(), 1);
});

test("assignment switch aborts old requests and purges old cached data", async () => {
  const coordinator = createRequestCoordinator();
  const cache = createSessionMemoryCache();
  const lifecycle = createContextLifecycle({
    service: { getSession: async () => session(), setActiveAssignment: async () => session("a2"), logout: async () => {} },
    coordinator,
    cache,
  });
  await lifecycle.initialize();
  cache.set(["task", "private"], { secret: "old" });
  const pending = coordinator.run("task", (signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  await lifecycle.switchAssignment("a2", { expectedVersion: 1, idempotencyKey: "switch-a2" });
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(cache.size(), 0);
  assert.equal(lifecycle.snapshot().context.assignmentId, "a2");
});

test("failed context switch does not re-expose the old session", async () => {
  const lifecycle = createContextLifecycle({
    service: {
      getSession: async () => session(),
      setActiveAssignment: async () => { throw new Error("forbidden"); },
      logout: async () => {},
    },
    coordinator: createRequestCoordinator(),
    cache: createSessionMemoryCache(),
  });
  await lifecycle.initialize();
  await assert.rejects(lifecycle.switchAssignment("a2", { expectedVersion: 1, idempotencyKey: "switch-fail" }), /forbidden/);
  assert.equal(lifecycle.snapshot().status, "error");
  assert.equal(lifecycle.snapshot().context, null);
});

test("invalid session context fails closed", async () => {
  const lifecycle = createContextLifecycle({
    service: {
      getSession: async () => ({ ...session(), context: { ...session().context, sessionEpoch: "" } }),
      setActiveAssignment: async () => session("a2"),
      logout: async () => {},
    },
    coordinator: createRequestCoordinator(),
    cache: createSessionMemoryCache(),
  });
  await assert.rejects(
    lifecycle.initialize(),
    (error) => error instanceof ContextLifecycleError && error.code === "SESSION_CONTEXT_INVALID",
  );
  assert.equal(lifecycle.snapshot().context, null);
});

test("logout purges context before the service call completes", async () => {
  let release;
  const serviceLogout = new Promise((resolve) => { release = resolve; });
  const cache = createSessionMemoryCache();
  const lifecycle = createContextLifecycle({
    service: { getSession: async () => session(), setActiveAssignment: async () => session("a2"), logout: async () => serviceLogout },
    coordinator: createRequestCoordinator(),
    cache,
  });
  await lifecycle.initialize();
  cache.set(["home"], { secret: true });
  const pending = lifecycle.logout();
  assert.equal(lifecycle.snapshot().context, null);
  assert.equal(cache.size(), 0);
  release();
  await pending;
  assert.equal(lifecycle.snapshot().status, "logged-out");
});

test("late session initialization cannot reinstall context after logout", async () => {
  let releaseSession;
  const pendingSession = new Promise((resolve) => { releaseSession = () => resolve(session()); });
  const lifecycle = createContextLifecycle({
    service: { getSession: async () => pendingSession, setActiveAssignment: async () => session("a2"), logout: async () => {} },
    coordinator: createRequestCoordinator(),
    cache: createSessionMemoryCache(),
  });
  const initialization = lifecycle.initialize();
  await lifecycle.logout();
  releaseSession();
  await assert.rejects(
    initialization,
    (error) => error instanceof ContextLifecycleError && error.code === "STALE_CONTEXT_TRANSITION",
  );
  assert.equal(lifecycle.snapshot().status, "logged-out");
  assert.equal(lifecycle.snapshot().context, null);
});

test("late assignment response cannot reinstall context after logout", async () => {
  let releaseSwitch;
  const pendingSwitch = new Promise((resolve) => { releaseSwitch = () => resolve(session("a2")); });
  const lifecycle = createContextLifecycle({
    service: { getSession: async () => session(), setActiveAssignment: async () => pendingSwitch, logout: async () => {} },
    coordinator: createRequestCoordinator(),
    cache: createSessionMemoryCache(),
  });
  await lifecycle.initialize();
  const switching = lifecycle.switchAssignment("a2", { expectedVersion: 1, idempotencyKey: "slow-switch" });
  await lifecycle.logout();
  releaseSwitch();
  await assert.rejects(
    switching,
    (error) => error instanceof ContextLifecycleError && error.code === "STALE_CONTEXT_TRANSITION",
  );
  assert.equal(lifecycle.snapshot().status, "logged-out");
  assert.equal(lifecycle.snapshot().context, null);
});
