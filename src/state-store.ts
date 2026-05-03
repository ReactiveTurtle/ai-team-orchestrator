import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, writeText } from "./fs-utils.js";
import type { JsonValue, RunState } from "./types.js";

export type RunStore = {
  runDir: string;
  artifactsDir: string;
  saveState(state: RunState): Promise<void>;
  appendEvent(type: string, payload: Record<string, JsonValue>): Promise<void>;
  writeArtifact(name: string, content: string): Promise<string>;
};

export async function createRunStore(aiTeamDir: string, runId: string): Promise<RunStore> {
  const runDir = join(aiTeamDir, "runs", runId);
  const artifactsDir = join(runDir, "artifacts");
  await ensureDir(artifactsDir);

  return {
    runDir,
    artifactsDir,
    async saveState(state) {
      await writeFile(join(runDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    },
    async appendEvent(type, payload) {
      const event = { timestamp: new Date().toISOString(), type, ...payload };
      await appendFile(join(runDir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
    },
    async writeArtifact(name, content) {
      const path = join(artifactsDir, name);
      await writeText(path, content);
      return path;
    }
  };
}

export function createRunId(): string {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `run-${stamp}`;
}
