import { contextScope } from "./cache-keys.js";

function serializeTuple(parts) {
  return JSON.stringify(parts);
}

/**
 * Tracks both the active authorization context and the latest mutation per
 * resource. Assignment transitions invalidate every captured token before
 * requests and principal-scoped queries are cancelled, so a late callback
 * cannot restore data that was already purged.
 */
export function createMutationContextGuard() {
  let contextGeneration = 0;
  let activeContextFingerprint = null;
  const latestMutationByScope = new Map();

  return Object.freeze({
    bind(context) {
      activeContextFingerprint = context ? serializeTuple(contextScope(context)) : null;
    },

    invalidate() {
      contextGeneration += 1;
      activeContextFingerprint = null;
      latestMutationByScope.clear();
    },

    capture(context, mutationScope) {
      const contextFingerprint = serializeTuple(contextScope(context));
      if (contextFingerprint !== activeContextFingerprint) {
        throw new Error("Mutation context is no longer active");
      }
      const mutationScopeKey = serializeTuple(mutationScope);
      const mutationGeneration = (latestMutationByScope.get(mutationScopeKey) ?? 0) + 1;
      latestMutationByScope.set(mutationScopeKey, mutationGeneration);
      return Object.freeze({
        contextFingerprint,
        contextGeneration,
        mutationScopeKey,
        mutationGeneration,
      });
    },

    isCurrent(token) {
      return Boolean(
        token
        && token.contextGeneration === contextGeneration
        && token.contextFingerprint === activeContextFingerprint
        && latestMutationByScope.get(token.mutationScopeKey) === token.mutationGeneration,
      );
    },
  });
}
