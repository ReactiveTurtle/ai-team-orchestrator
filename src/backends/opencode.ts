import { spawn } from "node:child_process";
import type { ExecutionBackend } from "./types.js";
import type { EmployeeRunInput, EmployeeRunResult } from "../types.js";

export class OpenCodeBackend implements ExecutionBackend {
  readonly name = "opencode";

  async runEmployee(input: EmployeeRunInput): Promise<EmployeeRunResult> {
    const command = process.env.AI_TEAM_OPENCODE_COMMAND;
    if (!command) return this.dryRun(input);

    const prompt = buildPrompt(input);
    const output = await runShellCommand(command, prompt);
    return parseResult(output, input);
  }

  private dryRun(input: EmployeeRunInput): EmployeeRunResult {
    const role = input.employee.role;
    if (role === "reviewer") {
      return {
        status: "approved",
        summary: `Dry-run review approved at level ${input.reviewLevel ?? 3}.`,
        findings: [],
        decisions: ["Dry-run reviewer did not execute OpenCode. Set AI_TEAM_OPENCODE_COMMAND to enable execution."]
      };
    }

    if (role === "explainer") {
      return {
        status: "done",
        summary: "Dry-run explanation completed.",
        decisions: ["Flow completed in dry-run mode."]
      };
    }

    return {
      status: "approved",
      summary: `Dry-run ${input.employee.name} completed step ${input.stepName}.`,
      decisions: ["No code was changed because OpenCode command is not configured."]
    };
  }
}

function buildPrompt(input: EmployeeRunInput): string {
  return [
    input.rolePrompt,
    input.employee.extra_instructions ? `Extra instructions:\n${input.employee.extra_instructions}` : undefined,
    input.principles.size > 0 ? `Workspace principles:\n${renderPrinciples(input.principles)}` : undefined,
    input.command ? `Command:\n${JSON.stringify(input.command, null, 2)}` : undefined,
    `Task:\n${input.task}`,
    `Step: ${input.stepName}`,
    input.reviewLevel ? `Review level: ${input.reviewLevel}` : undefined,
    input.reviewPolicy ? `Review policy:\n${JSON.stringify(input.reviewPolicy, null, 2)}` : undefined,
    `Current state:\n${JSON.stringify(input.state, null, 2)}`,
    "Return a concise result. If possible, include status: approved, needs_fix, or done."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderPrinciples(principles: Map<string, string>): string {
  return [...principles.entries()]
    .map(([name, content]) => `## ${name}\n${content}`)
    .join("\n\n");
}

async function runShellCommand(command: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`OpenCode command failed with exit code ${code}: ${stderr}`));
    });
    child.stdin.end(stdin);
  });
}

function parseResult(output: string, input: EmployeeRunInput): EmployeeRunResult {
  const normalized = output.toLowerCase();
  const status = normalized.includes("needs_fix") || normalized.includes("needs fix")
    ? "needs_fix"
    : input.employee.role === "explainer" || normalized.includes("done")
      ? "done"
      : "approved";

  return {
    status,
    summary: output || "OpenCode command returned no output.",
    artifact: output
  };
}
