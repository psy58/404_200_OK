import type { RequestContext } from "./ui-api-boundary-v2";

export interface MutationContextToken {
  readonly contextFingerprint: string;
  readonly contextGeneration: number;
  readonly mutationScopeKey: string;
  readonly mutationGeneration: number;
}

export interface MutationContextGuard {
  bind(context: RequestContext | null): void;
  invalidate(): void;
  capture(context: RequestContext, mutationScope: readonly (string | number)[]): MutationContextToken;
  isCurrent(token: MutationContextToken | undefined): boolean;
}

export function createMutationContextGuard(): MutationContextGuard;
