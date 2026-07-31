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

export type ProviderSettings = {
  provider: "opencode";
  command?: string;
};
