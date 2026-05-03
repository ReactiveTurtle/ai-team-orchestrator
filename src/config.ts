import { basename, dirname, join } from "node:path";
import type { CommandConfig, EmployeeConfig, LoadedConfig, ReviewPolicyConfig, TeamConfig } from "./types.js";
import { fileExists, listFiles, readText, readYaml } from "./fs-utils.js";

export const AI_TEAM_DIR = ".ai-team";

export async function loadConfig(rootDir = process.cwd()): Promise<LoadedConfig> {
  rootDir = findWorkspaceRoot(rootDir);
  const aiTeamDir = join(rootDir, AI_TEAM_DIR);
  const commands = new Map<string, CommandConfig>();
  const roles = new Map<string, string>();
  const principles = new Map<string, string>();
  const employees = new Map<string, EmployeeConfig>();
  const teams = new Map<string, TeamConfig>();

  for (const file of await listFiles(join(aiTeamDir, "commands"), ".yaml")) {
    const command = await readYaml<CommandConfig>(file);
    commands.set(command.name, command);
  }

  for (const file of await listFiles(join(aiTeamDir, "roles"), ".md")) {
    roles.set(basename(file, ".md"), await readText(file));
  }

  for (const file of await listFiles(join(aiTeamDir, "principles"), ".md")) {
    principles.set(basename(file, ".md"), await readText(file));
  }

  for (const file of await listFiles(join(aiTeamDir, "employees"), ".yaml")) {
    const employee = await readYaml<EmployeeConfig>(file);
    employees.set(employee.name, employee);
  }

  for (const file of await listFiles(join(aiTeamDir, "teams"), ".yaml")) {
    const team = await readYaml<TeamConfig>(file);
    teams.set(team.name, team);
  }

  const reviewPolicyPath = join(aiTeamDir, "policies", "review.yaml");
  const reviewPolicy = fileExists(reviewPolicyPath)
    ? await readYaml<ReviewPolicyConfig>(reviewPolicyPath)
    : undefined;

  return { rootDir, aiTeamDir, commands, roles, principles, employees, teams, reviewPolicy };
}

export function findWorkspaceRoot(startDir = process.cwd()): string {
  let current = startDir;

  while (true) {
    if (fileExists(join(current, AI_TEAM_DIR))) return current;

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`No ${AI_TEAM_DIR} directory found from ${startDir}. Run \`ai-team init\` in the project root first.`);
    }

    current = parent;
  }
}

export function validateConfig(config: LoadedConfig): string[] {
  const errors: string[] = [];

  if (config.roles.size === 0) errors.push("No roles found in .ai-team/roles");
  if (config.employees.size === 0) errors.push("No employees found in .ai-team/employees");
  if (config.teams.size === 0) errors.push("No teams found in .ai-team/teams");

  for (const command of config.commands.values()) {
    if (!command.name) errors.push("Command is missing name");
    if (!command.team) errors.push(`Command ${command.name} is missing team`);
    if (command.team && !config.teams.has(command.team)) {
      errors.push(`Command ${command.name} references missing team ${command.team}`);
    }
    if (!command.task && !command.task_template) {
      errors.push(`Command ${command.name} must define task or task_template`);
    }
  }

  for (const employee of config.employees.values()) {
    if (!employee.name) errors.push("Employee is missing name");
    if (!employee.role) errors.push(`Employee ${employee.name} is missing role`);
    if (employee.role && !config.roles.has(employee.role)) {
      errors.push(`Employee ${employee.name} references missing role ${employee.role}`);
    }
  }

  for (const team of config.teams.values()) {
    if (!team.name) errors.push("Team is missing name");
    if (!team.flow?.start) errors.push(`Team ${team.name} is missing flow.start`);
    if (!team.flow?.steps || Object.keys(team.flow.steps).length === 0) {
      errors.push(`Team ${team.name} has no flow.steps`);
      continue;
    }
    if (!team.flow.steps[team.flow.start]) {
      errors.push(`Team ${team.name} flow.start references missing step ${team.flow.start}`);
    }
    for (const member of team.members ?? []) {
      if (!config.employees.has(member)) errors.push(`Team ${team.name} references missing employee ${member}`);
    }
    for (const [stepName, step] of Object.entries(team.flow.steps)) {
      if (!config.employees.has(step.employee)) {
        errors.push(`Team ${team.name} step ${stepName} references missing employee ${step.employee}`);
      }
      for (const next of nextStepNames(step.next)) {
        if (next !== "done" && !team.flow.steps[next]) {
          errors.push(`Team ${team.name} step ${stepName} references missing next step ${next}`);
        }
      }
    }
  }

  return errors;
}

function nextStepNames(next: string | Record<string, string> | undefined): string[] {
  if (!next) return [];
  if (typeof next === "string") return [next];
  return Object.values(next);
}
