/**
 * Synthetic fixture composition for the V2 service boundary.
 * JSON is imported as unknown and validated by mock-service runtime parsers
 * before any value reaches the final design adapters.
 */
import contract from "../../mocks/backend/contract.json";
import home from "../../mocks/backend/home.json";
import problems from "../../mocks/backend/problems.json";
import searchResults from "../../mocks/backend/search-results.json";
import taskDetail from "../../mocks/backend/task-detail.student-competition.json";
import { createMemoryFixtureLoader, createMockApi } from "@/api/mock-service.js";
import type { FrontendApiService } from "@/api/ui-api-boundary-v2";

const fixtures: Readonly<Record<string, unknown>> = {
  "contract.json": contract,
  "home.json": home,
  "problems.json": problems,
  "search-results.json": searchResults,
  "task-detail.student-competition.json": taskDetail,
};

export function createPreviewApi(): Promise<FrontendApiService> {
  return createMockApi({ fixtureLoader: createMemoryFixtureLoader(fixtures), latencyMs: 180 });
}
