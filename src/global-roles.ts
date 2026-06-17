import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type GlobalRoleRegistry = {
  roles: Record<string, string>;
};

const registryPath = join(process.env.APPDATA ?? join(homedir(), ".config"), "ai-team", "roles.json");

export async function loadGlobalRoleRegistry(): Promise<GlobalRoleRegistry> {
  if (!existsSync(registryPath)) return { roles: {} };
  return JSON.parse(await readFile(registryPath, "utf8")) as GlobalRoleRegistry;
}

export async function saveGlobalRoles(roles: Record<string, string>): Promise<void> {
  const registry = await loadGlobalRoleRegistry();
  for (const [name, prompt] of Object.entries(roles)) {
    const normalized = name.trim();
    if (normalized) registry.roles[normalized] = prompt;
  }
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export async function readGlobalRoles(): Promise<Record<string, string>> {
  return (await loadGlobalRoleRegistry()).roles;
}
