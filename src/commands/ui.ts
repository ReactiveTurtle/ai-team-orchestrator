import blessed from "blessed";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadConfig, saveSettings, validateConfig } from "../config.js";
import { type RunProgressEvent, type RunResult, runConfiguredCommand } from "../engine.js";

type UiState = {
  command: string;
  busy: boolean;
  current?: {
    runId: string;
    step: string;
    employee: string;
    role: string;
    iteration: number;
  };
  lastResult?: RunResult;
  providerCommand?: string;
  reasoning?: string;
  abortController?: AbortController;
  startedAt?: number;
  transcriptPath: string;
  sessions: string[];
  events: string[];
};

export async function uiCommand(defaultCommand?: string, rootDir = process.cwd()): Promise<void> {
  const config = await loadConfig(rootDir);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const firstCommand = config.commands.keys().next().value as string | undefined;
  if (!firstCommand) throw new Error("No commands configured in .ai-team/commands");
  const preferredCommand = defaultCommand ?? config.settings.ui?.defaultCommand ?? firstCommand;
  let command: string = config.commands.has(preferredCommand) ? preferredCommand : firstCommand;

  const state: UiState = {
    command,
    busy: false,
    providerCommand: config.settings.provider?.command,
    transcriptPath: await createTranscript(config.aiTeamDir),
    sessions: [],
    events: []
  };

  const screen = blessed.screen({
    smartCSR: true,
    title: "ai-team"
  });

  const log = blessed.log({
    parent: screen,
    top: 0,
    left: 0,
    width: "78%",
    height: "86%",
    border: "line",
    label: " ai-team ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " " },
    style: {
      border: { fg: "#4a5568" },
      label: { fg: "#f6d365", bold: true },
      fg: "#e5e7eb",
      bg: "#111318"
    }
  });

  const side = blessed.box({
    parent: screen,
    top: 0,
    right: 0,
    width: "22%",
    height: "100%",
    border: "line",
    label: " status ",
    tags: true,
    style: {
      border: { fg: "#4a5568" },
      label: { fg: "#d6bcfa", bold: true },
      fg: "#d1d5db",
      bg: "#101217"
    }
  });

  blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: 1,
    height: "12%",
    style: { bg: "#93c5fd" }
  });

  blessed.box({
    parent: screen,
    bottom: 1,
    left: 1,
    width: "77%",
    height: "12%",
    style: { bg: "#1b1f2a" }
  });

  const inputPrompt = blessed.box({
    parent: screen,
    bottom: 2,
    left: 3,
    width: 18,
    height: 1,
    tags: true,
    content: `${command}>`,
    style: {
      bg: "#1b1f2a",
      fg: "#93c5fd"
    }
  });

  const input = blessed.textbox({
    parent: screen,
    bottom: 2,
    left: 21,
    width: "56%",
    height: 1,
    inputOnFocus: true,
    tags: true,
    style: {
      bg: "#1b1f2a",
      fg: "#f8fafc"
    }
  });

  function addLog(message: string): void {
    log.log(message);
    state.events.push(stripTags(message));
    if (state.events.length > 100) state.events.shift();
    screen.render();
  }

  function updateSide(): void {
    side.setContent(renderSide(state, config.commands, config.teams.get(command)?.flow.steps ?? {}));
    screen.render();
  }

  function setPrompt(): void {
    inputPrompt.setContent(`${state.busy ? "running" : command}>`);
    input.clearValue();
    input.focus();
    input.readInput();
    screen.render();
  }

  async function refreshSessions(): Promise<void> {
    state.sessions = await listSessions(config.aiTeamDir);
    updateSide();
  }

  async function selectSession(selector: string): Promise<void> {
    if (selector === "new") {
      state.transcriptPath = await createTranscript(config.aiTeamDir);
      state.events = [];
      log.setContent("");
      addLog(`{#f6d365-fg}new session{/} ${basename(state.transcriptPath)}`);
      await refreshSessions();
      return;
    }

    await refreshSessions();
    const index = Number.parseInt(selector, 10);
    const sessionPath = Number.isInteger(index) && index > 0
      ? state.sessions[index - 1]
      : state.sessions.find((path) => basename(path) === selector || path.endsWith(selector));

    if (!sessionPath) {
      addLog(`{#fca5a5-fg}Unknown session:{/} ${selector}`);
      addLog("Use /sessions to list available sessions.");
      return;
    }

    state.transcriptPath = sessionPath;
    state.events = [];
    log.setContent("");
    addLog(`{#f6d365-fg}session selected{/} ${basename(sessionPath)}`);
    await loadTranscriptIntoLog(sessionPath, addLog);
    updateSide();
  }

  async function openSessionMenu(): Promise<void> {
    await refreshSessions();

    const items = ["+ New session", ...state.sessions.map((sessionPath, index) => {
      const selected = sessionPath === state.transcriptPath ? "*" : " ";
      return `${selected} ${index + 1}. ${basename(sessionPath).replace("ui-session-", "")}`;
    })];

    const menu = blessed.list({
      parent: screen,
      top: "center",
      left: "center",
      width: "62%",
      height: "60%",
      border: "line",
      label: " sessions ",
      keys: true,
      mouse: true,
      vi: true,
      tags: true,
      items,
      style: {
        bg: "#151923",
        fg: "#e5e7eb",
        border: { fg: "#64748b" },
        selected: { bg: "#334155", fg: "#f8fafc" }
      }
    });

    const close = (): void => {
      menu.detach();
      input.focus();
      screen.render();
    };

    menu.key(["escape", "q"], close);
    menu.key(["n"], () => {
      close();
      void selectSession("new").then(() => setPrompt());
    });
    menu.on("select", (_item, index) => {
      close();
      if (index === 0) void selectSession("new").then(() => setPrompt());
      else void selectSession(String(index)).then(() => setPrompt());
    });

    menu.focus();
    screen.render();
  }

  function stopCurrentRun(): void {
    if (!state.busy || !state.abortController) {
      addLog("{#f6d365-fg}No running task to stop.{/}");
      return;
    }
    addLog("{#fca5a5-fg}stopping current task...{/}");
    state.abortController.abort();
  }

  async function runTask(text: string): Promise<void> {
    if (state.busy) {
      addLog("{#fca5a5-fg}Another task is already running.{/}");
      return;
    }

    state.busy = true;
    state.current = undefined;
    state.startedAt = Date.now();
    state.abortController = new AbortController();
    addLog(`{#93c5fd-fg}you{/} ${text}`);
    await appendTranscript(state.transcriptPath, { role: "user", command, content: text });
    updateSide();
    setPrompt();

    try {
      const result = await runConfiguredCommand(command, text, rootDir, {
        quiet: true,
        abortSignal: state.abortController.signal,
        onEvent: (event) => {
          handleProgress(event, state, addLog);
          updateSide();
        }
      });
      state.lastResult = result;
      state.current = undefined;
      state.reasoning = result.state.last_result?.reasoning_summary;
      if (state.reasoning) addLog(`{#d8b4fe-fg}public reasoning{/} ${state.reasoning}`);
      else addLog("{#d8b4fe-fg}public reasoning{/} Provider did not return a `Public Reasoning` section.");
      if (result.state.decisions.length > 0) {
        addLog("{#cbd5e1-fg}decisions{/}");
        for (const decision of result.state.decisions) addLog(`  - ${decision}`);
      }
      addLog(`{#cbd5e1-fg}run{/} ${result.runId}`);
      addLog(`{#cbd5e1-fg}state{/} ${result.statePath}`);
      await appendTranscript(state.transcriptPath, {
        role: "assistant",
        command,
        content: result.state.last_result?.summary ?? `Run ${result.status}`,
        runId: result.runId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`{#fca5a5-fg}error{/} ${message}`);
    } finally {
      state.busy = false;
      state.abortController = undefined;
      state.startedAt = undefined;
      updateSide();
      setPrompt();
    }
  }

  input.on("submit", async (value: string) => {
    const text = value.trim();
    input.clearValue();
    if (!text) {
      setPrompt();
      return;
    }

    if (text === "/exit" || text === "/quit") {
      if (state.busy) stopCurrentRun();
      screen.destroy();
      return;
    }
    if (text === "/stop") {
      stopCurrentRun();
      setPrompt();
      return;
    }
    if (text === "/commands") {
      for (const [name, commandConfig] of config.commands.entries()) {
        addLog(commandConfig.description ? `${name} - ${commandConfig.description}` : name);
      }
      setPrompt();
      return;
    }
    if (text === "/sessions") {
      await openSessionMenu();
      setPrompt();
      return;
    }
    if (text.startsWith("/session ")) {
      await selectSession(text.slice("/session ".length).trim());
      setPrompt();
      return;
    }
    if (text === "/provider") {
      addLog(state.providerCommand ? `{#f6d365-fg}provider{/} ${state.providerCommand}` : "{#f6d365-fg}provider{/} not configured");
      setPrompt();
      return;
    }
    if (text.startsWith("/provider set ")) {
      const nextProviderCommand = text.slice("/provider set ".length).trim();
      if (!nextProviderCommand) addLog("{#fca5a5-fg}Usage:{/} /provider set <command>");
      else {
        state.providerCommand = nextProviderCommand;
        config.settings.provider = { ...config.settings.provider, command: nextProviderCommand };
        const path = await saveSettings(config.settings, rootDir);
        addLog(`{#f6d365-fg}provider saved{/} ${nextProviderCommand}`);
        addLog(`{#cbd5e1-fg}settings{/} ${path}`);
      }
      updateSide();
      setPrompt();
      return;
    }
    if (text === "/provider clear") {
      state.providerCommand = undefined;
      config.settings.provider = { ...config.settings.provider, command: undefined };
      const path = await saveSettings(config.settings, rootDir);
      addLog("{#f6d365-fg}provider cleared{/}");
      addLog(`{#cbd5e1-fg}settings{/} ${path}`);
      updateSide();
      setPrompt();
      return;
    }
    if (text.startsWith("/command ")) {
      const nextCommand = text.slice("/command ".length).trim();
      if (!config.commands.has(nextCommand)) addLog(`{#fca5a5-fg}Unknown command:{/} ${nextCommand}`);
      else {
        command = nextCommand;
        state.command = nextCommand;
        addLog(`{#f6d365-fg}command{/} ${command}`);
      }
      updateSide();
      setPrompt();
      return;
    }
    if (text === "/help") {
      addLog("/commands, /command <name>, /default, /sessions, /session <n|name|new>, /stop, /provider, /provider set <command>, /provider clear, /exit. Type any task to run current command.");
      setPrompt();
      return;
    }
    if (text === "/default") {
      config.settings.ui = { ...config.settings.ui, defaultCommand: command };
      const path = await saveSettings(config.settings, rootDir);
      addLog(`{#f6d365-fg}default command saved{/} ${command}`);
      addLog(`{#cbd5e1-fg}settings{/} ${path}`);
      setPrompt();
      return;
    }

    void runTask(text);
  });

  screen.key(["C-c"], () => {
    if (state.busy) stopCurrentRun();
    screen.destroy();
  });
  screen.key(["escape"], () => stopCurrentRun());
  screen.key(["tab"], () => {
    input.focus();
    input.readInput();
  });

  addLog("{#f6d365-fg}ai-team ui{/}");
  await refreshSessions();
  addLog("Type a task. Use /commands, /command <name>, /sessions, /session <n|new>, /stop or Esc, /provider set <command>, /help, /exit.");
  updateSide();
  setPrompt();
}

function handleProgress(event: RunProgressEvent, state: UiState, addLog: (message: string) => void): void {
  if (event.type === "run_started") {
    addLog(`{#f6d365-fg}run started{/} ${event.runId} · ${event.team}`);
    return;
  }

  if (event.type === "step_started") {
    state.current = {
      runId: event.runId,
      step: event.step,
      employee: event.employee,
      role: event.role,
      iteration: event.iteration
    };
    addLog(`{#a7f3d0-fg}${event.employee}{/} started ${event.step} · ${event.role}`);
    addLog(`{#d8b4fe-fg}working notes{/} ${event.employee} is applying the ${event.role} role to the current task and will return a public reasoning summary when available.`);
    return;
  }

  if (event.type === "step_completed") {
    addLog(`{#86efac-fg}${event.employee}{/} completed ${event.step} · ${event.status} -> ${event.next ?? "done"}`);
    return;
  }

  addLog(`{#86efac-fg}run completed{/} ${event.runId} · ${event.status}`);
}

function renderSide(state: UiState, commands: Map<string, { description?: string }>, steps: Record<string, { employee: string }>): string {
  const commandLines = [...commands.keys()].map((name) => name === state.command ? `{#f6d365-fg}> ${name}{/}` : `  ${name}`);
  const flowLines = Object.entries(steps).map(([name, step]) => {
    const marker = state.current?.step === name ? "{#a7f3d0-fg}●{/}" : "○";
    return `${marker} ${name}\n  ${step.employee}`;
  });

  return [
    `{bold}Selected command{/bold}`,
    state.command,
    "Use /command <name>",
    "Use /default to save",
    "",
    `{bold}Current worker{/bold}`,
    state.current
      ? `${state.current.employee}\nrole: ${state.current.role}\nstep: ${state.current.step}\nstatus: running\ntime: ${formatElapsed(state.startedAt)}`
      : state.busy
        ? `starting...\ntime: ${formatElapsed(state.startedAt)}`
        : "idle",
    "",
    `{bold}Reasoning{/bold}`,
    state.reasoning ? truncate(state.reasoning, 220) : state.current ? "waiting for Public Reasoning..." : "none",
    "",
    `{bold}Provider{/bold}`,
    state.providerCommand ?? "not configured",
    "",
    `{bold}Available commands{/bold}`,
    ...commandLines,
    "",
    `{bold}Flow{/bold}`,
    ...flowLines,
    "",
    `{bold}Last run{/bold}`,
    state.lastResult ? `${state.lastResult.runId}\n${state.lastResult.status}` : "none",
    "",
    `{bold}Transcript{/bold}`,
    basename(state.transcriptPath),
    "",
    `{bold}Sessions{/bold}`,
    ...state.sessions.slice(0, 5).map((sessionPath, index) => `${sessionPath === state.transcriptPath ? ">" : " "} ${index + 1}. ${basename(sessionPath).replace("ui-session-", "")}`)
  ].join("\n");
}

async function createTranscript(aiTeamDir: string): Promise<string> {
  const sessionsDir = join(aiTeamDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return join(sessionsDir, `ui-session-${stamp}.jsonl`);
}

async function listSessions(aiTeamDir: string): Promise<string[]> {
  const sessionsDir = join(aiTeamDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const entries = await readdir(sessionsDir);
  const paths = entries
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => join(sessionsDir, entry));

  const withStats = await Promise.all(paths.map(async (path) => ({ path, stats: await stat(path) })));
  return withStats
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)
    .map((entry) => entry.path);
}

async function loadTranscriptIntoLog(path: string, addLog: (message: string) => void): Promise<void> {
  const content = await readFile(path, "utf8").catch(() => "");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line) as { role?: string; command?: string; content?: string; runId?: string };
      const role = message.role === "user" ? "{#93c5fd-fg}you{/}" : message.role === "assistant" ? "{#86efac-fg}assistant{/}" : "{#cbd5e1-fg}system{/}";
      addLog(`${role} ${message.command ? `[${message.command}] ` : ""}${message.content ?? ""}${message.runId ? ` · ${message.runId}` : ""}`);
    } catch {
      addLog(line);
    }
  }
}

async function appendTranscript(path: string, message: Omit<{ timestamp: string; role: string; command: string; content: string; runId?: string }, "timestamp">): Promise<void> {
  await appendFile(path, `${JSON.stringify({ timestamp: new Date().toISOString(), ...message })}\n`, "utf8");
}

function stripTags(value: string): string {
  return value.replaceAll(/\{[^}]+}/g, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatElapsed(startedAt: number | undefined): string {
  if (!startedAt) return "0s";
  return `${Math.max(0, Math.floor((Date.now() - startedAt) / 1000))}s`;
}
