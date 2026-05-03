import { join } from "node:path";
import { loadConfig, validateConfig } from "./config.js";
import { createBackends } from "./backends/index.js";
import { createRunId, createRunStore } from "./state-store.js";
import type { CommandConfig, EmployeeRunResult, RunState, TeamStepConfig } from "./types.js";

export type RunOptions = {
  command?: CommandConfig;
};

export async function runConfiguredCommand(commandName: string, input: string | undefined, rootDir = process.cwd()): Promise<void> {
  const config = await loadConfig(rootDir);
  const command = config.commands.get(commandName);
  if (!command) throw new Error(`Command not found: ${commandName}`);

  const task = renderCommandTask(command, input);
  await runTeamCommand(command.team, task, rootDir, { command });
}

export async function runTeamCommand(teamName: string, task: string, rootDir = process.cwd(), options: RunOptions = {}): Promise<void> {
  const config = await loadConfig(rootDir);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Configuration is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const team = config.teams.get(teamName);
  if (!team) throw new Error(`Team not found: ${teamName}`);

  const runId = createRunId();
  const store = await createRunStore(config.aiTeamDir, runId);
  const backends = createBackends();
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

  while (state.status === "running") {
    if (state.iteration >= maxIterations) {
      state.status = "failed";
      await store.appendEvent("run_failed", { reason: "max_iterations_reached", max_iterations: maxIterations });
      break;
    }

    const step = team.flow.steps[state.current_step];
    if (!step) throw new Error(`Current step is missing: ${state.current_step}`);

    state.iteration += 1;
    await store.appendEvent("step_started", { step: state.current_step, iteration: state.iteration });

    const result = await runStep(step, state.current_step, task, config, backends, state, options);
    state.last_result = result;
    state.findings.push(...(result.findings ?? []));
    state.decisions.push(...(result.decisions ?? []));

    const artifactPath = await store.writeArtifact(`${String(state.iteration).padStart(2, "0")}-${state.current_step}.md`, renderResult(result));
    state.artifacts.push(relativeArtifactPath(config.rootDir, artifactPath));

    const next = resolveNextStep(step.next, result.status);
    await store.appendEvent("step_completed", { step: state.current_step, result_status: result.status, next: next ?? "done" });

    if (!next || next === "done") {
      state.status = result.status === "needs_fix" ? "needs_fix" : "done";
      break;
    }

    state.current_step = next;
    await store.saveState(state);
  }

  await store.saveState(state);
  await store.appendEvent("run_completed", { status: state.status });

  console.log(`Run ${state.status}: ${runId}`);
  console.log(`State: ${join(store.runDir, "state.json")}`);
  console.log(`Artifacts: ${store.artifactsDir}`);
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
  const rolePrompt = config.roles.get(employee.role);
  if (!rolePrompt) throw new Error(`Missing role: ${employee.role}`);
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
    employee,
    state,
    reviewPolicy: config.reviewPolicy
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
  return [`# Result`, ``, `Status: ${result.status}`, ``, result.summary, result.artifact ? `\n## Artifact\n\n${result.artifact}` : ""].join("\n");
}

function relativeArtifactPath(rootDir: string, artifactPath: string): string {
  return artifactPath.startsWith(rootDir) ? artifactPath.slice(rootDir.length + 1) : artifactPath;
}
