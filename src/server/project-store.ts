import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AI_TEAM_DIR, findWorkspaceRoot, loadConfig } from "../config.js";

export type ProjectEntry = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type ProjectRegistry = {
  activeProjectId?: string;
  projects: ProjectEntry[];
};

const registryPath = join(process.env.APPDATA ?? join(homedir(), ".config"), "ai-team", "projects.json");

export async function loadProjectRegistry(): Promise<ProjectRegistry> {
  if (!existsSync(registryPath)) return { projects: [] };
  return JSON.parse(await readFile(registryPath, "utf8")) as ProjectRegistry;
}

export async function saveProjectRegistry(registry: ProjectRegistry): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export async function bootstrapProjectRegistry(startDir: string): Promise<ProjectRegistry> {
  const registry = await loadProjectRegistry();
  try {
    const rootDir = findWorkspaceRoot(startDir);
    return addProject(rootDir, undefined, true, registry);
  } catch {
    return registry;
  }
}

export async function addProject(projectPath: string, name?: string, makeActive = true, registry?: ProjectRegistry): Promise<ProjectRegistry> {
  registry ??= await loadProjectRegistry();
  const rootDir = findWorkspaceRoot(resolve(projectPath));
  await loadConfig(rootDir);
  const now = new Date().toISOString();
  const id = projectId(rootDir);
  const existing = registry.projects.find((project) => project.id === id);

  if (existing) {
    existing.name = name?.trim() || existing.name;
    existing.lastOpenedAt = now;
  } else {
    registry.projects.push({
      id,
      name: name?.trim() || projectName(rootDir),
      path: rootDir,
      createdAt: now,
      lastOpenedAt: now
    });
  }

  if (makeActive) registry.activeProjectId = id;
  await saveProjectRegistry(registry);
  return registry;
}

export async function removeProject(projectIdToRemove: string): Promise<ProjectRegistry> {
  const registry = await loadProjectRegistry();
  registry.projects = registry.projects.filter((project) => project.id !== projectIdToRemove);
  if (registry.activeProjectId === projectIdToRemove) registry.activeProjectId = registry.projects[0]?.id;
  await saveProjectRegistry(registry);
  return registry;
}

export async function selectProject(projectIdToSelect: string): Promise<ProjectRegistry> {
  const registry = await loadProjectRegistry();
  const project = registry.projects.find((item) => item.id === projectIdToSelect);
  if (!project) throw new Error(`Project not found: ${projectIdToSelect}`);
  await loadConfig(project.path);
  project.lastOpenedAt = new Date().toISOString();
  registry.activeProjectId = project.id;
  await saveProjectRegistry(registry);
  return registry;
}

export async function getActiveProjectRoot(): Promise<string> {
  const registry = await loadProjectRegistry();
  const project = registry.projects.find((item) => item.id === registry.activeProjectId) ?? registry.projects[0];
  if (!project) throw new Error(`No project selected. Add a project that contains ${AI_TEAM_DIR} first.`);
  return project.path;
}

function projectId(rootDir: string): string {
  return Buffer.from(resolve(rootDir).toLowerCase()).toString("base64url");
}

function projectName(rootDir: string): string {
  return rootDir.split(/[\\/]/).filter(Boolean).at(-1) ?? rootDir;
}
