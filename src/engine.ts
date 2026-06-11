import { join } from "node:path";
import { loadConfig, validateConfig } from "./config.js";
import { createBackends } from "./backends/index.js";
import { createRunId, createRunStore } from "./state-store.js";
import type { CommandConfig, EmployeeRunResult, RunState, TeamStepConfig } from "./types.js";

export type RunProgressEvent =
  | { type: "run_started"; runId: string; team: string; command?: string; task: string }
  | { type: "step_started"; runId: string; step: string; employee: string; role: string; iteration: number }
  | { type: "step_completed"; runId: string; step: string; employee: string; role: string; iteration: number; status: EmployeeRunResult["status"]; next?: string; summary: string; reasoning?: string; artifact?: string }
  | { type: "run_completed"; runId: string; status: RunState["status"]; statePath: string; artifactsDir: string };

export type RunOptions = {
  command?: CommandConfig;
  quiet?: boolean;
  onEvent?: (event: RunProgressEvent) => void;
  abortSignal?: AbortSignal;
};

export type RunResult = {
  runId: string;
  status: RunState["status"];
  statePath: string;
  artifactsDir: string;
  state: RunState;
};

export async function runConfiguredCommand(commandName: string, input: string | undefined, rootDir = process.cwd(), options: Omit<RunOptions, "command"> = {}): Promise<RunResult> {
  const config = await loadConfig(rootDir);
  const command = config.commands.get(commandName);
  if (!command) throw new Error(`Command not found: ${commandName}`);

  const task = renderCommandTask(command, input);
  return runTeamCommand(command.team, task, rootDir, { ...options, command });
}

export async function runTeamCommand(teamName: string, task: string, rootDir = process.cwd(), options: RunOptions = {}): Promise<RunResult> {
  const config = await loadConfig(rootDir);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const team = config.teams.get(teamName);
  if (!team) throw new Error(`Team not found: ${teamName}`);

  const runId = createRunId();
  const store = await createRunStore(config.aiTeamDir, runId);
  const backends = createBackends(config.settings);
  const maxIterations = team.limits?.max_iterations ?? 5;

  const state: RunState = {
    run_id: runId,
    task,
    team: team.name,
    current_step: team.flow.start,
    iteration: 0,
    status: "running",
    findings: [],
    decisions: [],
    artifacts: []
  };

  await store.saveState(state);
  await store.appendEvent("run_started", { team: team.name, task, command: options.command?.name ?? null });
  options.onEvent?.({ type: "run_started", runId, team: team.name, command: options.command?.name, task });

  while (state.status === "running") {
    if (options.abortSignal?.aborted) {
      state.status = "failed";
      await store.appendEvent("run_failed", { reason: "stopped" });
      break;
    }

    if (state.iteration >= maxIterations) {
      state.status = "failed";
      await store.appendEvent("run_failed", { reason: "max_iterations_reached", max_iterations: maxIterations });
      break;
    }

    const step = team.flow.steps[state.current_step];
    if (!step) throw new Error(`Current step is missing: ${state.current_step}`);
    const employee = config.employees.get(step.employee);
    if (!employee) throw new Error(`Missing employee: ${step.employee}`);

    state.iteration += 1;
    await store.appendEvent("step_started", { step: state.current_step, iteration: state.iteration });
    options.onEvent?.({
      type: "step_started",
      runId,
      step: state.current_step,
      employee: employee.name,
      role: step.role ?? employee.role,
      iteration: state.iteration
    });

    const result = await runStep(step, state.current_step, task, config, backends, state, options);
    state.last_result = result;
    state.findings.push(...(result.findings ?? []));
    state.decisions.push(...(result.decisions ?? []));

    const artifactPath = await store.writeArtifact(`${String(state.iteration).padStart(2, "0")}-${state.current_step}.md`, renderResult(result));
    state.artifacts.push(relativeArtifactPath(config.rootDir, artifactPath));

    const next = resolveNextStep(step.next, result.status);
    await store.appendEvent("step_completed", { step: state.current_step, result_status: result.status, next: next ?? "done" });
    options.onEvent?.({
      type: "step_completed",
      runId,
      step: state.current_step,
      employee: employee.name,
      role: step.role ?? employee.role,
      iteration: state.iteration,
      status: result.status,
      next: next ?? "done",
      summary: result.summary,
      reasoning: result.reasoning_summary,
      artifact: result.artifact
    });

    if (!next || next === "done") {
      state.status = result.status === "needs_fix" ? "needs_fix" : "done";
      break;
    }

    state.current_step = next;
    await store.saveState(state);
  }

  await store.saveState(state);
  await store.appendEvent("run_completed", { status: state.status });

  const result: RunResult = {
    runId,
    status: state.status,
    statePath: join(store.runDir, "state.json"),
    artifactsDir: store.artifactsDir,
    state
  };

  if (!options.quiet) {
    console.log(`Run ${state.status}: ${runId}`);
    console.log(`State: ${result.statePath}`);
    console.log(`Artifacts: ${result.artifactsDir}`);
  }

  options.onEvent?.({ type: "run_completed", runId, status: state.status, statePath: result.statePath, artifactsDir: result.artifactsDir });

  return result;
}

async function runStep(
  step: TeamStepConfig,
  stepName: string,
  task: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  backends: ReturnType<typeof createBackends>,
  state: RunState,
  options: RunOptions
): Promise<EmployeeRunResult> {
  const employee = config.employees.get(step.employee);
  if (!employee) throw new Error(`Missing employee: ${step.employee}`);
  const roleName = step.role ?? employee.role;
  const rolePrompt = config.roles.get(roleName);
  if (!rolePrompt) throw new Error(`Missing role: ${roleName}`);
  const backendName = employee.backend ?? "opencode";
  const backend = backends.get(backendName);
  if (!backend) throw new Error(`Missing backend: ${backendName}`);

  return backend.runEmployee({
    task,
    stepName,
    reviewLevel: step.review_level,
    command: options.command,
    principles: config.principles,
    rolePrompt,
    employee: { ...employee, role: roleName },
    state,
    reviewPolicy: config.reviewPolicy,
    abortSignal: options.abortSignal
  });
}

function renderCommandTask(command: CommandConfig, input: string | undefined): string {
  if (command.task_template) {
    return command.task_template.replaceAll("{{input}}", input ?? "").trim();
  }
  if (command.task) return command.task;
  throw new Error(`Command ${command.name} has no task or task_template`);
}

function resolveNextStep(next: TeamStepConfig["next"], status: EmployeeRunResult["status"]): string | undefined {
  if (!next) return undefined;
  if (typeof next === "string") return next;
  if (status === "needs_fix") return next.if_needs_fix;
  if (status === "approved") return next.if_approved;
  if (status === "done") return next.if_done ?? next.if_approved;
  return undefined;
}

function renderResult(result: EmployeeRunResult): string {
  return [
    `# Result`,
    ``,
    `Status: ${result.status}`,
    result.reasoning_summary ? `\n## Public Reasoning\n\n${result.reasoning_summary}` : "",
    ``,
    result.summary,
    result.artifact ? `\n## Artifact\n\n${result.artifact}` : ""
  ].join("\n");
}

function relativeArtifactPath(rootDir: string, artifactPath: string): string {
  return artifactPath.startsWith(rootDir) ? artifactPath.slice(rootDir.length + 1) : artifactPath;
}
