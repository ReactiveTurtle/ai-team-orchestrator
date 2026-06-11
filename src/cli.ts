#!/usr/bin/env node
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { consoleCommand } from "./commands/console.js";
import { uiCommand } from "./commands/ui.js";
import { providerCommand } from "./commands/provider.js";
import { runConfiguredCommand, runTeamCommand } from "./engine.js";
import { startServer } from "./server/server.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  if (!command) {
    await startServer();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initCommand();
    return;
  }

  if (command === "validate") {
    await validateCommand();
    return;
  }

  if (command === "provider") {
    await providerCommand(args);
    return;
  }

  if (command === "run") {
    const teamName = args[0];
    const runArgs = args.slice(1);
    const task = readOption(runArgs, "--task") ?? readOption(runArgs, "-t") ?? readPositionalTask(runArgs);
    if (!teamName || !task) {
      throw new Error("Usage: ai-team run <team> --task \"...\" or ai-team run <team> <task>");
    }
    await runTeamCommand(teamName, task);
    return;
  }

  if (command === "run-command") {
    const commandName = args[0];
    const commandArgs = args.slice(1);
    const input = readOption(commandArgs, "--input") ?? readOption(commandArgs, "-i") ?? readPositionalTask(commandArgs);
    if (!commandName) {
      throw new Error("Usage: ai-team run-command <command> --input \"...\"");
    }
    await runConfiguredCommand(commandName, input);
    return;
  }

  if (command === "console" || command === "chat") {
    await consoleCommand(args[0] ?? "feature");
    return;
  }

  if (command === "server" || command === "web" || command === "ui") {
    await startServer({ open: command !== "server" });
    return;
  }

  if (command === "tui") {
    await uiCommand(args[0] ?? "feature");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function readPositionalTask(args: string[]): string | undefined {
  const withoutOptions: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--task" || arg === "-t") {
      index += 1;
      continue;
    }
    if (!arg.startsWith("-")) withoutOptions.push(arg);
  }
  return withoutOptions.length > 0 ? withoutOptions.join(" ") : undefined;
}

function printHelp(): void {
  console.log(`ai-team\n\nUsage:\n  ai-team                         Open web UI\n  ai-team web|ui                  Open web UI\n  ai-team server                  Start web server without opening browser\n  ai-team tui [command]           Open legacy terminal UI\n  ai-team console [command]       Open plain text console\n  ai-team provider [get|set|clear]\n  ai-team init\n  ai-team validate\n  ai-team run <team> --task "..."\n  ai-team run <team> <task>\n  ai-team run-command <command> --input "..."\n\nEnvironment:\n  AI_TEAM_OPENCODE_COMMAND  Optional command override. Project provider.command is stored in .ai-team/settings.json.\n`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
