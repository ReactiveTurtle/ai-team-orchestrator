import { OpenCodeBackend } from "./opencode.js";
import type { ExecutionBackend } from "./types.js";
import type { SettingsConfig } from "../types.js";

export function createBackends(settings: SettingsConfig = {}): Map<string, ExecutionBackend> {
  const backends = new Map<string, ExecutionBackend>();
  const opencode = new OpenCodeBackend(settings.provider?.command);
  backends.set(opencode.name, opencode);
  return backends;
}
