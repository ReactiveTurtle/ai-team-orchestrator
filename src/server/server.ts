import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addProject, bootstrapProjectRegistry, loadProjectRegistry, removeProject, selectProject } from "./project-store.js";

type ServerOptions = {
  host?: string;
  port?: number;
  open?: boolean;
  rootDir?: string;
};

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "web", "browser");

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const rootDir = options.rootDir ?? process.cwd();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4791;

  await bootstrapProjectRegistry(rootDir);

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => sendError(res, error));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolveListen());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;
  if (options.open !== false) openBrowser(url);
  console.log(`ai-team web UI: ${url}`);

  return {
    url,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose()))
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  if (method === "GET" && !url.pathname.startsWith("/api/")) return serveWebAsset(res, url.pathname);
  if (method === "GET" && url.pathname === "/api/projects") return sendJson(res, await loadProjectRegistry());
  if (method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson<{ path: string; name?: string }>(req);
    if (!body.path) throw new Error("Укажите путь к проекту.");
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

  res.statusCode = 404;
  res.end("Not found");
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
