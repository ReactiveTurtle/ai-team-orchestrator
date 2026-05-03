import { OpenCodeBackend } from "./opencode.js";
import type { ExecutionBackend } from "./types.js";

export function createBackends(): Map<string, ExecutionBackend> {
  const backends = new Map<string, ExecutionBackend>();
  const opencode = new OpenCodeBackend();
  backends.set(opencode.name, opencode);
  return backends;
}
