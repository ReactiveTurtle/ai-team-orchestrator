import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CommandConfig, EmployeeConfig, TeamConfig } from "./types.js";
import { migrateCommandProfileNames } from "./global-name-migration.js";

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
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as GlobalCommandRegistry;
  const changed = registry.commands.some((profile) => migrateCommandProfileNames(profile));
  if (changed) await writeGlobalCommandRegistry(registry);
  return registry;
}

export async function saveGlobalCommandProfile(profile: GlobalCommandProfile): Promise<void> {
  const registry = await loadGlobalCommandRegistry();
  const index = registry.commands.findIndex((item) => item.command.name === profile.command.name);
  if (index === -1) registry.commands.push(profile);
  else registry.commands[index] = profile;
  for (const item of registry.commands) migrateCommandProfileNames(item);
  await writeGlobalCommandRegistry(registry);
}

export async function readGlobalCommandProfiles(): Promise<GlobalCommandProfile[]> {
  return (await loadGlobalCommandRegistry()).commands;
}

async function writeGlobalCommandRegistry(registry: GlobalCommandRegistry): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}
