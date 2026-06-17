export type Screen = "projects" | "tasks" | "workspace" | "command-editor";

export type ProjectEntry = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type ProjectRegistry = {
  activeProjectId?: string;
  projects: ProjectEntry[];
};

export type CommandConfig = {
  name: string;
  team: string;
  description?: string;
  task?: string;
  task_template?: string;
};

export type TeamStepConfig = { employee: string; role?: string; next?: string };

export type TeamConfig = {
  name: string;
  members?: string[];
  flow: {
    start: string;
    steps: Record<string, TeamStepConfig>;
  };
};

export type EmployeeConfig = {
  name: string;
  role: string;
  roles?: string[];
  backend?: string;
  model?: string;
  extra_instructions?: string;
};

export type RoleDraft = { name: string; prompt: string };
export type EmployeeDraft = { name: string; rolesText: string; backend?: string; model?: string; extra_instructions?: string };
export type PipelineStepDraft = { name: string; employee: string; role: string };

export type AppConfig = {
  commands: CommandConfig[];
  teams: TeamConfig[];
  employees: EmployeeConfig[];
  roles: Record<string, string>;
  settings?: {
    provider?: { command?: string };
    ui?: { defaultCommand?: string };
  };
  git?: { branch?: string };
};

export type TaskEntry = { id: string; title: string; mtime: number };
export type TaskMessage = { role?: string; kind?: string; content?: string; step?: string; employee?: string; status?: string; reasoning?: string };
export type TaskPage = { messages: TaskMessage[]; total: number; offset: number; hasMoreBefore: boolean };
export type TimelineMessage = { role: string; content: string; kind: string };

export type ProviderEvent =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; tool?: string; status?: string; title?: string; output?: string }
  | { type: "step"; status: "start" | "finish"; reason?: string };

export type TeamMemberView = {
  name: string;
  employee?: EmployeeConfig;
  role: string;
  responsibilities?: string;
};

export type EditorItem = { type: "command" | "role" | "employee" | "step"; index?: number };
