import { spawn } from "node:child_process";
import type { ExecutionBackend } from "./types.js";
import type { EmployeeRunInput, EmployeeRunResult, ProviderRunEvent } from "../types.js";

type ProviderOutput = {
  raw: string;
  text: string;
  reasoning?: string;
};

export class OpenCodeBackend implements ExecutionBackend {
  readonly name = "opencode";

  constructor(private readonly configuredCommand?: string) {}

  async runEmployee(input: EmployeeRunInput): Promise<EmployeeRunResult> {
    const command = process.env.AI_TEAM_OPENCODE_COMMAND ?? this.configuredCommand;
    if (!command) return this.dryRun(input);

    const prompt = buildPrompt(input);
    const output = await runShellCommand(prepareCommand(command), prompt, input.abortSignal, input.onProviderEvent);
    return parseResult(output, input);
  }

  private dryRun(input: EmployeeRunInput): EmployeeRunResult {
    const role = input.employee.role;
    if (role === "reviewer") {
      return {
        status: "approved",
        reasoning_summary: `Шаг проверен на уровне ${input.reviewLevel ?? 3} в dry-run режиме. Provider не запускался, поэтому это не реальное обоснование ревью.`,
        summary: `Dry-run ревью одобрено на уровне ${input.reviewLevel ?? 3}.`,
        findings: [],
        decisions: ["Dry-run reviewer не запускал provider. Настройте provider.command в .ai-team/settings.json или задайте AI_TEAM_OPENCODE_COMMAND."]
      };
    }

    if (role === "explainer") {
      return {
        status: "done",
        reasoning_summary: "Подготовлена сводка завершения в dry-run режиме без запуска provider.",
        summary: "Dry-run объяснение завершено.",
        decisions: ["Поток завершён в dry-run режиме."]
      };
    }

    return {
      status: "approved",
      reasoning_summary: `Сымитирована работа ${input.employee.name} на шаге ${input.stepName}. Реализация не выполнялась, потому что provider не настроен.`,
      summary: `Dry-run ${input.employee.name} завершил шаг ${input.stepName}.`,
      decisions: ["Код не изменялся, потому что provider command не настроен."]
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
    "Return a concise result. Include a section named `Public Reasoning`: explain the approach, constraints, and key checks without hidden chain-of-thought. If possible, include status: approved, needs_fix, or done."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderPrinciples(principles: Map<string, string>): string {
  return [...principles.entries()]
    .map(([name, content]) => `## ${name}\n${content}`)
    .join("\n\n");
}

async function runShellCommand(command: string, stdin: string, abortSignal?: AbortSignal, onProviderEvent?: (event: ProviderRunEvent) => void): Promise<ProviderOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let lineBuffer = "";
    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    let stderr = "";
    let settled = false;

    const abort = (): void => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Provider execution was stopped."));
    };

    if (abortSignal?.aborted) {
      abort();
      return;
    }

    abortSignal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) handleOutputLine(line, textParts, reasoningParts, onProviderEvent);
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener("abort", abort);
      if (lineBuffer.trim()) handleOutputLine(lineBuffer, textParts, reasoningParts, onProviderEvent);
      if (code === 0) resolve({ raw: stdout.trim(), text: textParts.join("\n\n").trim() || stdout.trim(), reasoning: reasoningParts.join("\n\n").trim() || undefined });
      else reject(new Error(`OpenCode command failed with exit code ${code}: ${stderr}`));
    });
    child.stdin.end(stdin);
  });
}

function prepareCommand(command: string): string {
  if (!/(^|\s)opencode(?:\.cmd|\.exe)?\s+run\b/i.test(command)) return command;
  let prepared = command;
  if (!/--format\s+json\b/i.test(prepared)) prepared += " --format json";
  if (!/--thinking\b/i.test(prepared)) prepared += " --thinking";
  return prepared;
}

function handleOutputLine(line: string, textParts: string[], reasoningParts: string[], onProviderEvent?: (event: ProviderRunEvent) => void): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  const event = parseJsonEvent(trimmed);
  if (!event) {
    textParts.push(trimmed);
    return;
  }

  const part = event.part as Record<string, unknown> | undefined;
  if (event.type === "reasoning" && typeof part?.["text"] === "string") {
    const text = part["text"].trim();
    if (!text) return;
    reasoningParts.push(text);
    onProviderEvent?.({ type: "reasoning", text });
    return;
  }

  if (event.type === "text" && typeof part?.["text"] === "string") {
    const text = part["text"].trim();
    if (!text) return;
    textParts.push(text);
    onProviderEvent?.({ type: "text", text });
    return;
  }

  if (event.type === "tool_use" && part?.["type"] === "tool") {
    const state = part["state"] as Record<string, unknown> | undefined;
    onProviderEvent?.({
      type: "tool",
      tool: typeof part["tool"] === "string" ? part["tool"] : undefined,
      status: typeof state?.["status"] === "string" ? state["status"] : undefined,
      title: typeof state?.["title"] === "string" ? state["title"] : undefined,
      output: typeof state?.["output"] === "string" ? state["output"] : undefined
    });
    return;
  }

  if (event.type === "step_start") {
    onProviderEvent?.({ type: "step", status: "start" });
    return;
  }

  if (event.type === "step_finish") {
    const reason = typeof part?.["reason"] === "string" ? part["reason"] : undefined;
    onProviderEvent?.({ type: "step", status: "finish", reason });
  }
}

function parseJsonEvent(line: string): { type?: string; part?: unknown } | undefined {
  try {
    const value = JSON.parse(line) as unknown;
    return typeof value === "object" && value ? value as { type?: string; part?: unknown } : undefined;
  } catch {
    return undefined;
  }
}

function parseResult(output: ProviderOutput, input: EmployeeRunInput): EmployeeRunResult {
  const resultText = output.text || output.raw;
  const normalized = resultText.toLowerCase();
  const status = normalized.includes("needs_fix") || normalized.includes("needs fix")
    ? "needs_fix"
    : input.employee.role === "explainer" || normalized.includes("done")
      ? "done"
      : "approved";

  return {
    status,
    reasoning_summary: output.reasoning ?? extractReasoningSummary(resultText),
    summary: resultText || "OpenCode command returned no output.",
    artifact: resultText
  };
}

function extractReasoningSummary(output: string): string | undefined {
  const match = output.match(/(?:#{1,3}\s*)?(?:public reasoning|public reasoning summary|reasoning summary|rationale)\s*:?\s*\n?([\s\S]*?)(?:\n#{1,3}\s|\n(?:summary|result|findings|decisions|status)\s*:|$)/i);
  const value = match?.[1]?.trim();
  return value || undefined;
}
