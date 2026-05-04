import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, validateConfig } from "../config.js";
import { type RunResult, runConfiguredCommand } from "../engine.js";

type ConsoleMessage = {
  timestamp: string;
  role: "user" | "system" | "assistant";
  command: string;
  content: string;
  runId?: string;
};

export async function consoleCommand(defaultCommand = "feature", rootDir = process.cwd()): Promise<void> {
  const config = await loadConfig(rootDir);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  let currentCommand = defaultCommand;
  if (!config.commands.has(currentCommand)) {
    const firstCommand = config.commands.keys().next().value as string | undefined;
    if (!firstCommand) throw new Error("No commands configured in .ai-team/commands");
    currentCommand = firstCommand;
  }

  const transcriptPath = await createTranscript(config.aiTeamDir);
  let lastResult: RunResult | undefined;
  printIntro(currentCommand, transcriptPath);
  await appendTranscript(transcriptPath, {
    timestamp: new Date().toISOString(),
    role: "system",
    command: currentCommand,
    content: "Console session started."
  });

  async function handleLine(rawLine: string): Promise<boolean> {
    const line = rawLine.trim();
    if (!line) return true;

    if (line === "/exit" || line === "/quit") return false;
    if (line === "/help") {
      printHelp();
      return true;
    }
    if (line === "/commands") {
      printCommands(config.commands);
      return true;
    }
    if (line === "/status") {
      printStatus(currentCommand, transcriptPath, lastResult);
      return true;
    }
    if (line === "/last") {
      if (lastResult) printRunResult(lastResult);
      else console.log("No runs in this console session yet.");
      return true;
    }
    if (line.startsWith("/command ")) {
      const nextCommand = line.slice("/command ".length).trim();
      if (!config.commands.has(nextCommand)) {
        console.log(`Unknown command: ${nextCommand}`);
        printCommands(config.commands);
        return true;
      }
      currentCommand = nextCommand;
      console.log(`Switched to command: ${currentCommand}`);
      return true;
    }

    await appendTranscript(transcriptPath, {
      timestamp: new Date().toISOString(),
      role: "user",
      command: currentCommand,
      content: line
    });

    try {
      console.log(`\nai-team is running '${currentCommand}'...`);
      lastResult = await runConfiguredCommand(currentCommand, line, rootDir, { quiet: true });
      printRunResult(lastResult);
      await appendTranscript(transcriptPath, {
        timestamp: new Date().toISOString(),
        role: "assistant",
        command: currentCommand,
        content: lastResult.state.last_result?.summary ?? `Run ${lastResult.status}`,
        runId: lastResult.runId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
    }

    return true;
  }

  if (!input.isTTY) {
    const content = await readAllStdin();
    for (const line of content.split(/\r?\n/)) {
      const keepGoing = await handleLine(line);
      if (!keepGoing) break;
    }
    return;
  }

  const rl = createInterface({ input, output, prompt: `\n${currentCommand}> ` });
  try {
    rl.prompt();
    for await (const rawLine of rl) {
      const previousCommand = currentCommand;
      const keepGoing = await handleLine(rawLine);
      if (!keepGoing) break;
      if (previousCommand !== currentCommand) rl.setPrompt(`\n${currentCommand}> `);
      rl.prompt();
    }
  } finally {
    rl.close();
  }
}

async function createTranscript(aiTeamDir: string): Promise<string> {
  const sessionsDir = join(aiTeamDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return join(sessionsDir, `session-${stamp}.jsonl`);
}

async function appendTranscript(path: string, message: ConsoleMessage): Promise<void> {
  await appendFile(path, `${JSON.stringify(message)}\n`, "utf8");
}

async function readAllStdin(): Promise<string> {
  let content = "";
  for await (const chunk of input) content += chunk.toString();
  return content;
}

function printIntro(command: string, transcriptPath: string): void {
  console.log("ai-team");
  console.log("Interactive AI team console");
  console.log(`Command: ${command}`);
  console.log(`Transcript: ${transcriptPath}`);
  console.log("Type a task, /commands, /command <name>, /status, /last, /help, or /exit.");
}

function printHelp(): void {
  console.log(`Commands:\n  /commands          List configured commands\n  /command <name>    Switch current command\n  /status            Show current console status\n  /last              Show the last run result again\n  /help              Show help\n  /exit              Exit console\n\nAny other input is sent to the current ai-team command.`);
}

function printCommands(commands: Map<string, { description?: string }>): void {
  for (const [name, command] of commands.entries()) {
    console.log(command.description ? `${name} - ${command.description}` : name);
  }
}

function printStatus(command: string, transcriptPath: string, lastResult: RunResult | undefined): void {
  console.log(`Command: ${command}`);
  console.log(`Transcript: ${transcriptPath}`);
  console.log(lastResult ? `Last run: ${lastResult.runId} (${lastResult.status})` : "Last run: none");
}

function printRunResult(result: RunResult): void {
  const last = result.state.last_result;
  console.log(`\nassistant (${result.status})`);
  if (last?.reasoning_summary) {
    console.log("\nReasoning summary:");
    console.log(last.reasoning_summary);
  }
  if (last?.summary) console.log(last.summary);

  if (result.state.findings.length > 0) {
    console.log("\nFindings:");
    for (const finding of result.state.findings) {
      console.log(`- [${finding.severity}] ${finding.area}: ${finding.message}`);
    }
  }

  if (result.state.decisions.length > 0) {
    console.log("\nDecisions:");
    for (const decision of result.state.decisions) console.log(`- ${decision}`);
  }

  console.log(`\nRun: ${result.runId}`);
  console.log(`State: ${result.statePath}`);
  console.log(`Artifacts: ${result.artifactsDir}`);
}
