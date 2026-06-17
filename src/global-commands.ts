import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CommandConfig, EmployeeConfig, TeamConfig } from "./types.js";

export type GlobalCommandProfile = {
  command: CommandConfig;
  team: TeamConfig;
  employees: EmployeeConfig[];
  roles?: Record<string, string>;
};

export type GlobalCommandRegistry = {
  commands: GlobalCommandProfile[];
};

const registryPath = join(process.env.APPDATA ?? join(homedir(), ".config"), "ai-team", "commands.json");

export async function loadGlobalCommandRegistry(): Promise<GlobalCommandRegistry> {
  if (!existsSync(registryPath)) return { commands: [] };
  return JSON.parse(await readFile(registryPath, "utf8")) as GlobalCommandRegistry;
}

export async function saveGlobalCommandProfile(profile: GlobalCommandProfile): Promise<void> {
  const registry = await loadGlobalCommandRegistry();
  const index = registry.commands.findIndex((item) => item.command.name === profile.command.name);
  if (index === -1) registry.commands.push(profile);
  else registry.commands[index] = profile;
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export async function readGlobalCommandProfiles(): Promise<GlobalCommandProfile[]> {
  return (await loadGlobalCommandRegistry()).commands;
}
