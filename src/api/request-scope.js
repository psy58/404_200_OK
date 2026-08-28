/**
 * Stable structural request scope. JSON tuple serialization distinguishes
 * element boundaries and value types, including IDs that contain delimiters.
 */
export function requestScope(parts) {
  return JSON.stringify(parts.filter((part) => part !== undefined));
}
