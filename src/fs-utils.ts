import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeText(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf8");
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readYaml<T>(path: string): Promise<T> {
  return YAML.parse(await readText(path)) as T;
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export async function listFiles(path: string, extension: string): Promise<string[]> {
  if (!fileExists(path)) return [];
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(path, entry.name));
}
