import assert from "node:assert/strict";
import test from "node:test";

import { ApiTransportError, BoundaryConfigurationError, createRealTransport } from "../../src/api/real-transport.js";

test("real transport is blocked without confirmed OpenAPI inputs", () => {
  assert.throws(
    () => createRealTransport({}),
    (error) => error instanceof BoundaryConfigurationError && error.code === "BACKEND_CONTRACT_REQUIRED",
  );
});

test("capability without an operation mapping is blocked", async () => {
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: {},
    fetchImpl: async () => { throw new Error("must not fetch"); },
  });
  await assert.rejects(
    transport.invoke("getHome"),
    (error) => error instanceof BoundaryConfigurationError && error.code === "BACKEND_CONTRACT_REQUIRED",
  );
});

test("client authority fields are rejected before fetch", async () => {
  let called = false;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: { save: { operationId: "save", method: "POST", path: "/save", parseResponse: (value) => value } },
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    transport.invoke("save", { body: { role: "admin" } }),
    (error) => error instanceof BoundaryConfigurationError && error.code === "CLIENT_AUTHORITY_FIELD_FORBIDDEN",
  );
  assert.equal(called, false);
});

test("circular request values fail closed before serialization", async () => {
  let called = false;
  const body = { title: "draft" };
  body.self = body;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: { save: { operationId: "save", method: "POST", path: "/save", parseResponse: (value) => value } },
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    transport.invoke("save", { body }),
    (error) => error instanceof BoundaryConfigurationError && error.code === "REQUEST_VALUE_CIRCULAR",
  );
  assert.equal(called, false);
});

test("protocol-relative OpenAPI paths are rejected before fetch", async () => {
  let called = false;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: { load: { operationId: "load", method: "GET", path: "//evil.example/data", parseResponse: (value) => value } },
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    transport.invoke("load"),
    (error) => error instanceof BoundaryConfigurationError && error.code === "OPENAPI_PATH_INVALID",
  );
  assert.equal(called, false);
});

test("confirmed operation encodes paths and validates the success response", async () => {
  let captured;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/v2/",
    operations: {
      load: {
        operationId: "loadItem",
        method: "GET",
        path: "/items/{itemId}",
        parseResponse(value) {
          if (value?.state !== "ready") throw new TypeError("unexpected state");
          return { state: value.state };
        },
      },
    },
    fetchImpl: async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ state: "ready", ignored: true }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  });
  const result = await transport.invoke("load", {
    pathParams: { itemId: "task/a" },
    query: { cursor: "다음", limit: 20, includeClosed: false },
  });
  assert.deepEqual(result, { state: "ready" });
  assert.equal(captured.url, "https://api.example.test/items/task%2Fa?cursor=%EB%8B%A4%EC%9D%8C&limit=20&includeClosed=false");
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.redirect, "error");
});

test("runtime response schema failure is blocked before UI use", async () => {
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: {
      load: {
        operationId: "loadItem",
        method: "GET",
        path: "/item",
        parseResponse() { throw new TypeError("invalid schema"); },
      },
    },
    fetchImpl: async () => new Response(JSON.stringify({ unexpected: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  });
  await assert.rejects(
    transport.invoke("load"),
    (error) => error instanceof ApiTransportError && error.issue.code === "RESPONSE_SCHEMA_INVALID",
  );
});

test("unsafe methods are rejected before fetch", async () => {
  let called = false;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: { trace: { operationId: "trace", method: "TRACE", path: "/trace", parseResponse: (value) => value } },
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    transport.invoke("trace"),
    (error) => error instanceof BoundaryConfigurationError && error.code === "OPENAPI_METHOD_INVALID",
  );
  assert.equal(called, false);
});

test("authority selectors are rejected in query and path parameters", async () => {
  let called = false;
  const transport = createRealTransport({
    openApiRevision: "test-revision",
    baseUrl: "https://api.example.test/",
    operations: { load: { operationId: "load", method: "GET", path: "/items", parseResponse: (value) => value } },
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(
    transport.invoke("load", { query: { school_id: "school-other" } }),
    (error) => error instanceof BoundaryConfigurationError && error.code === "CLIENT_AUTHORITY_FIELD_FORBIDDEN",
  );
  await assert.rejects(
    transport.invoke("load", { pathParams: { userId: "someone-else" } }),
    (error) => error instanceof BoundaryConfigurationError && error.code === "CLIENT_AUTHORITY_FIELD_FORBIDDEN",
  );
  assert.equal(called, false);
});
