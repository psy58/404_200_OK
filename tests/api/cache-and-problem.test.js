import assert from "node:assert/strict";
import test from "node:test";

import { apiKeys } from "../../src/api/cache-keys.js";
import { mapProblemToUiIssue } from "../../src/api/problem-mapper.js";

const context = Object.freeze({
  userId: "usr-a",
  schoolId: "sch-a",
  assignmentId: "asg-a",
  sessionEpoch: "epoch-1",
});

test("query keys include the complete authorization context", () => {
  const key = apiKeys.task(context, "task-1");
  assert.deepEqual(key.slice(0, 8), ["principal", "usr-a", "school", "sch-a", "assignment", "asg-a", "epoch", "epoch-1"]);
});

test("assignment switch produces a different cache key", () => {
  const before = apiKeys.home(context);
  const after = apiKeys.home({ ...context, assignmentId: "asg-b" });
  assert.notDeepEqual(before, after);
});

test("session epoch change invalidates otherwise identical cache keys", () => {
  const before = apiKeys.home(context);
  const after = apiKeys.home({ ...context, sessionEpoch: "epoch-2" });
  assert.notDeepEqual(before, after);
});

test("412 problem maps to recoverable conflict UI", () => {
  const issue = mapProblemToUiIssue({
    status: 412,
    code: "VERSION_CONFLICT",
    title: "conflict",
    detail: "reload",
    trace_id: "trace-1",
  });
  assert.equal(issue.retryable, true);
  assert.equal(issue.recoveryAction, "reload-latest");
  assert.equal(issue.supportId, "trace-1");
});

test("422 problem preserves field errors without HTML rendering", () => {
  const issue = mapProblemToUiIssue({
    status: 422,
    code: "VALIDATION_FAILED",
    title: "invalid",
    detail: "check input",
    trace_id: "trace-2",
    field_errors: [{ field: "text", message: "required" }],
  });
  assert.deepEqual(issue.fieldErrors, [{ field: "text", message: "required" }]);
  assert.equal(issue.retryable, false);
});
