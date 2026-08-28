import type { RequestContext } from "./ui-api-boundary-v2";

export type ApiQueryKey = readonly unknown[];

export function contextScope(context: RequestContext): ApiQueryKey;
export function queryKey(
  context: RequestContext,
  resource: string,
  params?: Readonly<Record<string, unknown>>,
): ApiQueryKey;

export const apiKeys: {
  home(context: RequestContext): ApiQueryKey;
  annual(context: RequestContext, params?: Readonly<Record<string, unknown>>): ApiQueryKey;
  task(context: RequestContext, taskId: string): ApiQueryKey;
  documents(context: RequestContext, params?: Readonly<Record<string, unknown>>): ApiQueryKey;
  search(context: RequestContext, params?: Readonly<Record<string, unknown>>): ApiQueryKey;
  notes(context: RequestContext, params?: Readonly<Record<string, unknown>>): ApiQueryKey;
  handover(context: RequestContext, academicYear: number): ApiQueryKey;
  notifications(context: RequestContext, params?: Readonly<Record<string, unknown>>): ApiQueryKey;
  analysis(context: RequestContext, jobId: string): ApiQueryKey;
};
