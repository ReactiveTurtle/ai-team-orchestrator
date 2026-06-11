export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type EmployeeConfig = {
  name: string;
  role: string;
  roles?: string[];
  backend?: string;
  model?: string;
  extra_instructions?: string;
  project_context?: Record<string, JsonValue>;
};

export type CommandConfig = {
  name: string;
  team: string;
  description?: string;
  task?: string;
  task_template?: string;
};

export type TeamStepConfig = {
  employee: string;
  role?: string;
  review_level?: number;
  next?: string | Record<string, string>;
};

export type TeamConfig = {
  name: string;
  members: string[];
  flow: {
    start: string;
    steps: Record<string, TeamStepConfig>;
  };
  limits?: {
    max_iterations?: number;
  };
};

export type ReviewPolicyConfig = {
  quality_axes?: string[];
  levels?: Record<string, { focus: string[] }>;
};

export type SettingsConfig = {
  provider?: {
    command?: string;
  };
  ui?: {
    defaultCommand?: string;
  };
};

export type LoadedConfig = {
  rootDir: string;
  aiTeamDir: string;
  commands: Map<string, CommandConfig>;
  employees: Map<string, EmployeeConfig>;
  teams: Map<string, TeamConfig>;
  roles: Map<string, string>;
  principles: Map<string, string>;
  settings: SettingsConfig;
  reviewPolicy?: ReviewPolicyConfig;
};

export type RunState = {
  run_id: string;
  task: string;
  team: string;
  current_step: string;
  iteration: number;
  status: "running" | "done" | "needs_fix" | "failed";
  findings: Finding[];
  decisions: string[];
  artifacts: string[];
  last_result?: EmployeeRunResult;
};

export type Finding = {
  area: string;
  severity: "low" | "medium" | "high";
  message: string;
};

export type EmployeeRunInput = {
  task: string;
  stepName: string;
  reviewLevel?: number;
  command?: CommandConfig;
  principles: Map<string, string>;
  rolePrompt: string;
  employee: EmployeeConfig;
  state: RunState;
  reviewPolicy?: ReviewPolicyConfig;
  abortSignal?: AbortSignal;
};

export type EmployeeRunResult = {
  status: "approved" | "needs_fix" | "done";
  reasoning_summary?: string;
  summary: string;
  findings?: Finding[];
  decisions?: string[];
  artifact?: string;
};
