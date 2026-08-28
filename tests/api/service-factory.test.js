import assert from "node:assert/strict";
import test from "node:test";

import { createFrontendApiService, ServiceModeError } from "../../src/api/service-factory.js";

test("service mode has no implicit mock or real fallback", async () => {
  await assert.rejects(
    createFrontendApiService({ runtimeEnvironment: "development" }),
    (error) => error instanceof ServiceModeError && error.code === "SERVICE_MODE_REQUIRED",
  );
});

test("production mock is blocked before the mock factory runs", async () => {
  let called = false;
  await assert.rejects(createFrontendApiService({
    mode: "mock",
    runtimeEnvironment: "production",
    allowMock: true,
    createMock: async () => { called = true; return { contractStatus: "MOCK_ONLY" }; },
  }), (error) => error instanceof ServiceModeError && error.code === "PRODUCTION_MOCK_FORBIDDEN");
  assert.equal(called, false);
});

test("non-production mock requires explicit opt-in", async () => {
  await assert.rejects(createFrontendApiService({
    mode: "mock",
    runtimeEnvironment: "development",
    createMock: async () => ({ contractStatus: "MOCK_ONLY" }),
  }), (error) => error instanceof ServiceModeError && error.code === "MOCK_OPT_IN_REQUIRED");
});

test("mock preview exposes a MOCK_ONLY boundary", async () => {
  const service = await createFrontendApiService({
    mode: "mock",
    runtimeEnvironment: "development",
    allowMock: true,
    createMock: async () => ({ contractStatus: "MOCK_ONLY", persistence: "session-only" }),
  });
  assert.equal(service.contractStatus, "MOCK_ONLY");
});

test("real mode rejects a service without confirmed contract status", async () => {
  await assert.rejects(createFrontendApiService({
    mode: "real",
    runtimeEnvironment: "production",
    createReal: async () => ({ contractStatus: "PROPOSED" }),
  }), (error) => error instanceof ServiceModeError && error.code === "SERVICE_BOUNDARY_MISMATCH");
});

test("confirmed real service can start in production", async () => {
  const service = await createFrontendApiService({
    mode: "real",
    runtimeEnvironment: "production",
    createReal: async () => ({ contractStatus: "CONFIRMED" }),
  });
  assert.equal(service.contractStatus, "CONFIRMED");
});
