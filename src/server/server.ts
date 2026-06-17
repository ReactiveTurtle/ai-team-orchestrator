import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, basename, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveSettings } from "../config.js";
import { saveGlobalCommandProfile, type GlobalCommandProfile } from "../global-commands.js";
import { saveGlobalRoles } from "../global-roles.js";
import type { CommandConfig, EmployeeConfig, ProviderRunEvent, TeamConfig } from "../types.js";
import { type RunProgressEvent, runConfiguredCommand } from "../engine.js";
import { addProject, bootstrapProjectRegistry, getActiveProjectRoot, loadProjectRegistry, removeProject, selectProject } from "./project-store.js";

type ServerOptions = {
  host?: string;
  port?: number;
  open?: boolean;
  rootDir?: string;
};

type RunRecord = {
  runId: string;
  events: unknown[];
  clients: Set<ServerResponse>;
  abortController: AbortController;
  done: boolean;
  started: Promise<void>;
  resolveStarted: () => void;
};

type CommandProfilePayload = CommandConfig & {
  team_config?: TeamConfig;
  employees?: EmployeeConfig[];
  roles?: Record<string, string>;
};

const runs = new Map<string, RunRecord>();
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "web", "browser");

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const rootDir = options.rootDir ?? process.cwd();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4791;

  await bootstrapProjectRegistry(rootDir);

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => sendError(res, error));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;
  if (options.open !== false) openBrowser(url);
  console.log(`ai-team web UI: ${url}`);

  return {
    url,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  if (method === "GET" && !url.pathname.startsWith("/api/")) return serveWebAsset(res, url.pathname);
  if (method === "GET" && url.pathname === "/api/projects") return sendJson(res, await loadProjectRegistry());
  if (method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson<{ path: string; name?: string }>(req);
    if (!body.path) throw new Error("Project path is required");
    return sendJson(res, await addProject(body.path, body.name));
  }
  if (method === "POST" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/select")) {
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/select".length));
    return sendJson(res, await selectProject(id));
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/projects/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length));
    return sendJson(res, await removeProject(id));
  }

  const rootDir = await getActiveProjectRoot();
  if (method === "GET" && url.pathname === "/api/config") return sendJson(res, await getConfig(rootDir));
  if (method === "POST" && url.pathname === "/api/commands") {
    const body = await readJson<CommandProfilePayload>(req);
    await saveCommand(rootDir, body);
    return sendJson(res, await getConfig(rootDir));
  }
  if (method === "PUT" && url.pathname.startsWith("/api/commands/")) {
    const originalName = decodeURIComponent(url.pathname.slice("/api/commands/".length));
    const body = await readJson<CommandProfilePayload>(req);
    await saveCommand(rootDir, body, originalName);
    return sendJson(res, await getConfig(rootDir));
  }
  if (method === "GET" && url.pathname === "/api/provider") {
    const config = await loadConfig(rootDir);
    return sendJson(res, { provider: config.settings.provider ?? {} });
  }
  if (method === "GET" && url.pathname === "/api/sessions") return sendJson(res, { sessions: await listSessions(rootDir) });
  if (method === "POST" && url.pathname === "/api/sessions") return sendJson(res, { session: await createSession(rootDir) });
  if (method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/sessions/".length));
    return sendJson(res, { id, messages: await readSession(rootDir, id) });
  }
  if (method === "POST" && url.pathname === "/api/provider") {
    const body = await readJson<{ command?: string }>(req);
    const config = await loadConfig(rootDir);
    config.settings.provider = { ...config.settings.provider, command: body.command || undefined };
    await saveSettings(config.settings, rootDir);
    return sendJson(res, { settings: config.settings });
  }
  if (method === "POST" && url.pathname === "/api/runs") {
    const body = await readJson<{ command: string; input: string; sessionId?: string }>(req);
    const record = await startRun(rootDir, body.command, body.input, body.sessionId);
    return sendJson(res, { runId: record.runId });
  }
  if (method === "GET" && url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/events")) {
    const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/events".length));
    return attachRunEvents(res, runId);
  }
  if (method === "POST" && url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/stop")) {
    const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/stop".length));
    const record = runs.get(runId);
    record?.abortController.abort();
    return sendJson(res, { stopped: Boolean(record) });
  }

  res.statusCode = 404;
  res.end("Not found");
}

async function getConfig(rootDir: string): Promise<unknown> {
  const config = await loadConfig(rootDir);
  return {
    commands: [...config.commands.values()],
    teams: [...config.teams.values()],
    employees: [...config.employees.values()],
    roles: Object.fromEntries(config.roles),
    settings: config.settings,
    git: { branch: await currentGitBranch(rootDir) }
  };
}

async function currentGitBranch(rootDir: string): Promise<string | undefined> {
  return new Promise((resolveBranch) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: rootDir, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("error", () => resolveBranch(undefined));
    child.on("close", (code) => resolveBranch(code === 0 ? output.trim() || undefined : undefined));
  });
}

async function saveCommand(rootDir: string, command: CommandProfilePayload, originalName?: string): Promise<void> {
  const config = await loadConfig(rootDir);
  const name = command.name?.trim();
  if (!name) throw new Error("Укажите имя команды.");
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Имя команды может содержать только латиницу, цифры, _ и -.");
  if (!command.team && !command.team_config) throw new Error("Опишите команду исполнителей.");
  if (!command.task && !command.task_template) throw new Error("Укажите task или task_template.");

  const saved: CommandConfig = {
    name,
    description: command.description?.trim() || undefined,
    team: command.team,
    task: command.task?.trim() || undefined,
    task_template: command.task_template?.trim() || undefined
  };

  const team = command.team_config ?? config.teams.get(command.team);
  if (!team) throw new Error("Команда исполнителей не найдена.");
  const employeeNames = team.members?.length ? team.members : [...new Set(Object.values(team.flow.steps).map((step) => step.employee))];
  const employees = command.employees?.length
    ? command.employees
    : employeeNames.map((employeeName) => config.employees.get(employeeName)).filter(Boolean) as EmployeeConfig[];
  const roles = command.roles ?? Object.fromEntries(employees.map((employee) => [employee.role, config.roles.get(employee.role) ?? ""]));
  await saveGlobalRoles(roles);
  const profile: GlobalCommandProfile = {
    command: saved,
    team: team as TeamConfig,
    employees
  };
  await saveGlobalCommandProfile(profile);
}

async function startRun(rootDir: string, command: string, input: string, sessionId: string | undefined): Promise<RunRecord> {
  const abortController = new AbortController();
  let resolveStarted = (): void => {};
  const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
  const record: RunRecord = { runId: `pending-${Date.now()}`, events: [], clients: new Set(), abortController, done: false, started, resolveStarted };

  void (async () => {
    let completedEvent: RunProgressEvent | undefined;
    const transcriptWrites: Promise<void>[] = [];
    try {
      await appendSession(rootDir, sessionId, { role: "user", command, content: input });
      const result = await runConfiguredCommand(command, input, rootDir, {
        quiet: true,
        abortSignal: abortController.signal,
        onEvent: (event) => {
          if (event.type === "run_started") {
            runs.delete(record.runId);
            record.runId = event.runId;
            runs.set(record.runId, record);
            record.resolveStarted();
          }
          if (event.type === "step_started") {
            transcriptWrites.push(appendSession(rootDir, sessionId, {
              role: "event",
              kind: "step_started",
              command,
              runId: event.runId,
              step: event.step,
              employee: event.employee,
              content: `${event.employee} начал шаг ${event.step}`
            }));
          }
          if (event.type === "provider_event") {
            const content = renderProviderEvent(event.event);
            transcriptWrites.push(appendSession(rootDir, sessionId, {
              role: event.event.type === "text" ? "assistant" : "event",
              kind: `provider_${event.event.type}`,
              command,
              runId: event.runId,
              step: event.step,
              employee: event.employee,
              event: event.event,
              content
            }));
          }
          if (event.type === "step_completed") {
            transcriptWrites.push(appendSession(rootDir, sessionId, {
              role: "assistant",
              kind: "step_result",
              command,
              runId: event.runId,
              step: event.step,
              employee: event.employee,
              status: event.status,
              reasoning: event.reasoning,
              artifact: event.artifact,
              content: event.summary
            }));
          }
          if (event.type === "run_completed") {
            completedEvent = event;
            return;
          }
          publish(record, event);
        }
      });
      publish(record, { type: "result", reasoning: result.state.last_result?.reasoning_summary, summary: result.state.last_result?.summary });
      if (completedEvent) publish(record, completedEvent);
      await Promise.all(transcriptWrites);
      await appendSession(rootDir, sessionId, { role: "event", kind: "run_completed", command, content: `Запуск завершён: ${result.status}`, runId: result.runId, status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      publish(record, { type: "error", message });
      await appendSession(rootDir, sessionId, { role: "event", kind: "run_error", command, content: message });
      record.resolveStarted();
    } finally {
      record.done = true;
      closeClients(record);
    }
  })();

  runs.set(record.runId, record);
  await record.started;
  return record;
}

function publish(record: RunRecord, event: RunProgressEvent | Record<string, unknown>): void {
  record.events.push(event);
  for (const client of record.clients) writeSse(client, event);
}

function renderProviderEvent(event: ProviderRunEvent): string {
  if (event.type === "reasoning") return event.text ?? "";
  if (event.type === "text") return event.text ?? "";
  if (event.type === "tool") return [event.tool, event.status, event.title].filter(Boolean).join(" · ") || "Tool event";
  if (event.type === "step") return event.reason ? `OpenCode step ${event.status}: ${event.reason}` : `OpenCode step ${event.status}`;
  return JSON.stringify(event);
}

function attachRunEvents(res: ServerResponse, runId: string): void {
  const record = runs.get(runId);
  if (!record) {
    res.statusCode = 404;
    res.end("Run not found");
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  record.clients.add(res);
  for (const event of record.events) writeSse(res, event);
  if (record.done) res.end();
  res.on("close", () => record.clients.delete(res));
}

function writeSse(res: ServerResponse, event: unknown): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function closeClients(record: RunRecord): void {
  for (const client of record.clients) client.end();
  record.clients.clear();
}

async function listSessions(rootDir: string): Promise<Array<{ id: string; mtime: number }>> {
  const config = await loadConfig(rootDir);
  const dir = join(config.aiTeamDir, "sessions");
  await mkdir(dir, { recursive: true });
  const entries = (await readdir(dir)).filter((entry) => entry.endsWith(".jsonl"));
  const sessions = await Promise.all(entries.map(async (entry) => ({ id: entry, mtime: (await stat(join(dir, entry))).mtimeMs })));
  return sessions.sort((a, b) => b.mtime - a.mtime);
}

async function createSession(rootDir: string): Promise<{ id: string }> {
  const config = await loadConfig(rootDir);
  const dir = join(config.aiTeamDir, "sessions");
  await mkdir(dir, { recursive: true });
  const id = `web-session-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.jsonl`;
  await appendFile(join(dir, id), "", "utf8");
  return { id };
}

async function readSession(rootDir: string, id: string): Promise<unknown[]> {
  const config = await loadConfig(rootDir);
  const path = join(config.aiTeamDir, "sessions", basename(id));
  const content = await readFile(path, "utf8").catch(() => "");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function appendSession(rootDir: string, id: string | undefined, message: Record<string, unknown>): Promise<void> {
  if (!id) return;
  const config = await loadConfig(rootDir);
  const path = join(config.aiTeamDir, "sessions", basename(id));
  await appendFile(path, `${JSON.stringify({ timestamp: new Date().toISOString(), ...message })}\n`, "utf8");
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let body = "";
  for await (const chunk of req) body += chunk.toString();
  return body ? JSON.parse(body) as T : {} as T;
}

function sendJson(res: ServerResponse, value: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function sendHtml(res: ServerResponse, value: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(value);
}

async function serveWebAsset(res: ServerResponse, pathname: string): Promise<void> {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const requestedPath = resolve(webRoot, safePath || "index.html");
  if (!requestedPath.startsWith(webRoot)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  const assetPath = existsSync(requestedPath) ? requestedPath : join(webRoot, "index.html");
  const content = await readFile(assetPath).catch(() => undefined);
  if (!content) {
    res.statusCode = 500;
    res.end("Angular web assets are missing. Run `npm run build` first.");
    return;
  }
  res.writeHead(200, { "content-type": mimeType(assetPath) });
  res.end(content);
}

function mimeType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".json": return "application/json";
    default: return "application/octet-stream";
  }
}

function sendError(res: ServerResponse, error: unknown): void {
  res.statusCode = 500;
  res.end(error instanceof Error ? error.message : String(error));
}

function openBrowser(url: string): void {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}
