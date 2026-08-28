import assert from "node:assert/strict";
import test from "node:test";

import { createRequestCoordinator, createSessionMemoryCache } from "../../src/api/request-coordinator.js";

test("new request aborts the previous request in the same scope", async () => {
  const coordinator = createRequestCoordinator();
  let firstAborted = false;
  const first = coordinator.run("home", (signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
      firstAborted = true;
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
    setTimeout(() => resolve("old"), 50);
  }));
  const second = coordinator.run("home", async () => "new");
  await assert.rejects(first, (error) => error.name === "AbortError");
  assert.equal(await second, "new");
  assert.equal(firstAborted, true);
});

test("independent scopes can complete in parallel", async () => {
  const coordinator = createRequestCoordinator();
  const [home, search] = await Promise.all([
    coordinator.run("home", async () => "home-ready"),
    coordinator.run("search", async () => "search-ready"),
  ]);
  assert.deepEqual([home, search], ["home-ready", "search-ready"]);
});

test("cancelAll aborts requests during assignment switch", async () => {
  const coordinator = createRequestCoordinator();
  const pending = coordinator.run("task", (signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  coordinator.cancelAll();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.deepEqual(coordinator.pendingScopes(), []);
});

test("session memory cache clears on authorization-context change", () => {
  const cache = createSessionMemoryCache();
  const base = { userId: "u1", schoolId: "s1", assignmentId: "a1", sessionEpoch: "e1" };
  cache.bind(base);
  cache.set(["home"], { secret: "old-context" });
  assert.equal(cache.size(), 1);
  cache.bind({ ...base, assignmentId: "a2" });
  assert.equal(cache.size(), 0);
  assert.equal(cache.get(["home"]), undefined);
});

test("cache context fingerprints cannot collide through delimiter characters", () => {
  const cache = createSessionMemoryCache();
  cache.bind({ userId: "u|school", schoolId: "s", assignmentId: "a", sessionEpoch: "e" });
  cache.set(["home"], { secret: "old-context" });
  cache.bind({ userId: "u", schoolId: "school|s", assignmentId: "a", sessionEpoch: "e" });
  assert.equal(cache.size(), 0);
});

test("cache rejects incomplete authorization context", () => {
  const cache = createSessionMemoryCache();
  assert.throws(
    () => cache.bind({ userId: "u1", schoolId: "s1", assignmentId: "a1", sessionEpoch: "" }),
    /Complete user\/school\/assignment\/session context/,
  );
});
