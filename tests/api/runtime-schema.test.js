import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ContractValidationError,
  parseContractDto,
  parseHomeDto,
  parseProblemCatalog,
  parseSearchDto,
  parseTaskDetailDto,
} from "../../src/api/runtime-schema.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`../../mocks/backend/${name}`, import.meta.url), "utf8"));

test("five MOCK_ONLY fixtures pass runtime validation", async () => {
  parseContractDto(await fixture("contract.json"));
  parseHomeDto(await fixture("home.json"));
  parseTaskDetailDto(await fixture("task-detail.student-competition.json"));
  parseSearchDto(await fixture("search-results.json"));
  parseProblemCatalog(await fixture("problems.json"));
});

test("unknown task status fails closed", async () => {
  const value = await fixture("home.json");
  value.primary_task.status = "looks_successful";
  assert.throws(() => parseHomeDto(value), ContractValidationError);
});

test("unexpected authority-like response fields fail closed", async () => {
  const value = await fixture("home.json");
  value.context.role = "admin";
  assert.throws(() => parseHomeDto(value), /unexpected field/);
});

test("duplicate checklist ids fail closed", async () => {
  const value = await fixture("task-detail.student-competition.json");
  value.checklist[1].id = value.checklist[0].id;
  assert.throws(() => parseTaskDetailDto(value), /duplicate id/);
});

test("impossible calendar dates and date-times fail closed", async () => {
  const value = await fixture("home.json");
  value.primary_task.dates.official_due = "2026-02-30";
  assert.throws(() => parseHomeDto(value), /YYYY-MM-DD/);

  const dateTime = await fixture("home.json");
  dateTime.generated_at = "2025-02-29T09:00:00+09:00";
  assert.throws(() => parseHomeDto(dateTime), /ISO 8601/);
});

test("Gregorian leap-day values remain valid", async () => {
  const value = await fixture("home.json");
  value.primary_task.dates.official_due = "2024-02-29";
  value.generated_at = "2024-02-29T09:00:00+09:00";
  assert.doesNotThrow(() => parseHomeDto(value));
});

test("checklist completed count cannot exceed total", async () => {
  const value = await fixture("home.json");
  value.primary_task.checklist_done = 99;
  assert.throws(() => parseHomeDto(value), /cannot exceed/);
});

test("protocol-relative and backslash navigation targets fail closed", async () => {
  const protocolRelative = await fixture("search-results.json");
  protocolRelative.items[0].target = "//evil.example/task";
  assert.throws(() => parseSearchDto(protocolRelative), /same-origin/);

  const backslash = await fixture("home.json");
  backslash.summary_links[0].target = "/tasks\\..\\admin";
  assert.throws(() => parseHomeDto(backslash), /same-origin/);
});
