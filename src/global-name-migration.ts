import type { CommandConfig, EmployeeConfig, TeamConfig } from "./types.js";

export const roleNameMap: Record<string, string> = {
  builder: "исполнитель",
  reviewer: "ревьюер",
  explainer: "объясняющий",
  architect: "архитектор",
  "backend-developer": "backend-разработчик",
  "frontend-developer": "frontend-разработчик",
  "requirements-clarifier": "аналитик требований",
  verifier: "проверяющий"
};

const employeeNameMap: Record<string, string> = {
  "backend-builder": "backend-исполнитель",
  "strict-reviewer": "строгий ревьюер",
  "pr-explainer": "объясняющий результат",
  "frontend-builder": "frontend-исполнитель",
  "requirements-clarifier": "аналитик требований",
  architect: "архитектор",
  verifier: "проверяющий",
  "general-builder": "универсальный исполнитель",
  "backend-developer": "backend-разработчик",
  "frontend-developer": "frontend-разработчик"
};

const stepNameMap: Record<string, string> = {
  build: "реализация",
  work: "работа",
  review: "ревью",
  explain: "объяснение",
  clarify: "уточнение",
  plan: "планирование",
  verify: "проверка",
  backend: "backend",
  frontend: "frontend"
};

const commandNameMap: Record<string, string> = {
  feature: "Разработка фичи",
  "backend-feature": "Backend-фича",
  "frontend-feature": "Frontend-фича",
  clarify: "Уточнение требований",
  plan: "Планирование",
  review: "Ревью",
  verify: "Проверка"
};

export function migrateRoleNames(roles: Record<string, string>): { roles: Record<string, string>; changed: boolean } {
  let changed = false;
  const next: Record<string, string> = {};
  for (const [name, prompt] of Object.entries(roles)) {
    const migrated = roleNameMap[name] ?? name;
    next[migrated] = next[migrated] ?? prompt;
    changed ||= migrated !== name;
  }
  return { roles: next, changed };
}

export function migrateCommandProfileNames(profile: { command: CommandConfig; team: TeamConfig; employees: EmployeeConfig[]; roles?: Record<string, string> }): boolean {
  let changed = false;
  const employeeMap = new Map(profile.employees.map((employee) => [employee.name, employeeNameMap[employee.name] ?? employee.name]));
  const stepMap = new Map(Object.keys(profile.team.flow.steps).map((name) => [name, stepNameMap[name] ?? name]));

  const commandName = commandNameMap[profile.command.name] ?? profile.command.name;
  if (commandName !== profile.command.name) {
    profile.command.name = commandName;
    changed = true;
  }

  for (const employee of profile.employees) {
    const nextName = employeeMap.get(employee.name) ?? employee.name;
    if (nextName !== employee.name) {
      employee.name = nextName;
      changed = true;
    }
    const nextRole = roleNameMap[employee.role] ?? employee.role;
    if (nextRole !== employee.role) {
      employee.role = nextRole;
      changed = true;
    }
    const nextRoles = employee.roles?.map((role) => roleNameMap[role] ?? role);
    if (nextRoles && nextRoles.join("\0") !== (employee.roles ?? []).join("\0")) {
      employee.roles = nextRoles;
      changed = true;
    }
  }

  const nextMembers = profile.team.members.map((member) => employeeMap.get(member) ?? member);
  if (nextMembers.join("\0") !== profile.team.members.join("\0")) {
    profile.team.members = nextMembers;
    changed = true;
  }

  const nextSteps: TeamConfig["flow"]["steps"] = {};
  for (const [stepName, step] of Object.entries(profile.team.flow.steps)) {
    const nextName = stepMap.get(stepName) ?? stepName;
    const nextEmployee = employeeMap.get(step.employee) ?? step.employee;
    const nextRole = step.role ? roleNameMap[step.role] ?? step.role : undefined;
    const nextNext = typeof step.next === "string" ? stepMap.get(step.next) ?? step.next : step.next;
    nextSteps[nextName] = { ...step, employee: nextEmployee, role: nextRole, next: nextNext };
    changed ||= nextName !== stepName || nextEmployee !== step.employee || nextRole !== step.role || nextNext !== step.next;
  }
  profile.team.flow.steps = nextSteps;
  const nextStart = stepMap.get(profile.team.flow.start) ?? profile.team.flow.start;
  if (nextStart !== profile.team.flow.start) {
    profile.team.flow.start = nextStart;
    changed = true;
  }

  if (profile.roles) {
    const migrated = migrateRoleNames(profile.roles);
    profile.roles = migrated.roles;
    changed ||= migrated.changed;
  }

  return changed;
}

export function migrateLoadedConfigNames(commands: Map<string, CommandConfig>, teams: Map<string, TeamConfig>, employees: Map<string, EmployeeConfig>): void {
  for (const command of [...commands.values()]) {
    const team = teams.get(command.team);
    if (!team) continue;
    const profile = { command: { ...command }, team: cloneTeam(team), employees: [...employees.values()].map((employee) => ({ ...employee })) };
    migrateCommandProfileNames(profile);
    commands.delete(command.name);
    commands.set(profile.command.name, profile.command);
    teams.set(profile.team.name, profile.team);
    if (profile.team.name !== command.team) profile.command.team = profile.team.name;
    for (const employee of profile.employees) employees.set(employee.name, employee);
  }
  for (const [oldName, newName] of Object.entries(employeeNameMap)) {
    if (oldName !== newName) employees.delete(oldName);
  }
}

function cloneTeam(team: TeamConfig): TeamConfig {
  return {
    ...team,
    members: [...(team.members ?? [])],
    flow: {
      start: team.flow.start,
      steps: Object.fromEntries(Object.entries(team.flow.steps).map(([name, step]) => [name, { ...step }]))
    }
  };
}
