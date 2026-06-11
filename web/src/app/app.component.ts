import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, ElementRef, ViewChild, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";

type ProjectEntry = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
};

type ProjectRegistry = {
  activeProjectId?: string;
  projects: ProjectEntry[];
};

type CommandConfig = {
  name: string;
  team: string;
  description?: string;
  task?: string;
  task_template?: string;
};

type TeamConfig = {
  name: string;
  members?: string[];
  flow: {
    start: string;
    steps: Record<string, { employee: string; role?: string; next?: string }>;
  };
};

type EmployeeConfig = {
  name: string;
  role: string;
  roles?: string[];
  backend?: string;
  model?: string;
  extra_instructions?: string;
};

type RoleDraft = { name: string; prompt: string };
type EmployeeDraft = { name: string; rolesText: string; backend?: string; model?: string; extra_instructions?: string };
type PipelineStepDraft = { name: string; employee: string; role: string };

type AppConfig = {
  commands: CommandConfig[];
  teams: TeamConfig[];
  employees: EmployeeConfig[];
  roles: Record<string, string>;
  settings?: {
    provider?: { command?: string };
    ui?: { defaultCommand?: string };
  };
};

type TaskEntry = { id: string; mtime: number };
type TaskMessage = { role?: string; kind?: string; content?: string; step?: string; employee?: string; status?: string; reasoning?: string };
type TimelineMessage = { role: string; content: string; kind: string };

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  private readonly http = inject(HttpClient);

  @ViewChild("timelineContainer") private timelineContainer?: ElementRef<HTMLElement>;

  readonly screen = signal<"projects" | "workspace">("projects");
  readonly projects = signal<ProjectEntry[]>([]);
  readonly activeProjectId = signal<string | undefined>(undefined);
  readonly config = signal<AppConfig | undefined>(undefined);
  readonly command = signal<string | undefined>(undefined);
  readonly tasks = signal<TaskEntry[]>([]);
  readonly taskId = signal<string | undefined>(undefined);
  readonly timeline = signal<TimelineMessage[]>([]);
  readonly chatEmptyText = signal("Опишите, что нужно сделать. Команда начнёт работу после отправки.");
  readonly currentRunId = signal<string | undefined>(undefined);
  readonly currentRunTaskId = signal<string | undefined>(undefined);
  readonly currentStep = signal<string | undefined>(undefined);
  readonly doneSteps = signal<Set<string>>(new Set());
  readonly worker = signal("ожидание");
  readonly workerDetail = signal("");
  readonly processNote = signal("Ожидаю задачу.");
  readonly publicReasoning = signal("");
  readonly providerResult = signal("");
  readonly runStartedAt = signal<number | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly lastRun = signal<{ runId: string; status: string } | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly addFormOpen = signal(false);
  readonly paletteOpen = signal(false);
  readonly taskListOpen = signal(false);
  readonly commandEditorOpen = signal(false);
  readonly commandListOpen = signal(false);

  projectPath = "";
  providerCommand = "";
  taskText = "";
  commandOriginalName = "";
  commandDraft: CommandConfig = { name: "", team: "", description: "", task_template: "" };
  commandDraftRoles: RoleDraft[] = [];
  commandDraftEmployees: EmployeeDraft[] = [];
  commandDraftSteps: PipelineStepDraft[] = [];

  readonly activeProject = computed(() => this.projects().find((project) => project.id === this.activeProjectId()));
  readonly selectedTeam = computed(() => {
    const config = this.config();
    const teamName = config?.commands.find((command) => command.name === this.command())?.team;
    return config?.teams.find((team) => team.name === teamName);
  });
  readonly steps = computed(() => Object.entries(this.selectedTeam()?.flow.steps ?? {}).map(([name, step]) => ({ name, ...step })));
  readonly teamMembers = computed(() => {
    const config = this.config();
    const team = this.selectedTeam();
    if (!config || !team) return [];
    const names = team.members?.length ? team.members : [...new Set(Object.values(team.flow.steps).map((step) => step.employee))];
    return names.map((name) => {
      const employee = config.employees.find((item) => item.name === name);
      return {
        name,
        employee,
        role: employee?.role ?? "роль не указана",
        responsibilities: employee?.role ? config.roles[employee.role] : undefined
      };
    });
  });
  readonly draftTeamMembers = computed(() => {
    const config = this.config();
    const team = config?.teams.find((item) => item.name === this.commandDraft.team);
    if (!config || !team) return [];
    const names = team.members?.length ? team.members : [...new Set(Object.values(team.flow.steps).map((step) => step.employee))];
    return names.map((name) => {
      const employee = config.employees.find((item) => item.name === name);
      return {
        name,
        employee,
        role: employee?.role ?? "роль не указана",
        responsibilities: employee?.role ? config.roles[employee.role] : undefined
      };
    });
  });
  readonly canStop = computed(() => Boolean(this.currentRunId()));
  readonly elapsedLabel = computed(() => {
    const startedAt = this.runStartedAt();
    if (!startedAt) return "-";
    const seconds = Math.max(0, Math.floor((this.now() - startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  });

  constructor() {
    void this.refreshProjects();
    window.setInterval(() => this.now.set(Date.now()), 1000);
    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && ["p", "з"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        this.paletteOpen.update((value) => !value);
      }
      if (event.key === "Escape") {
        if (this.taskListOpen()) this.taskListOpen.set(false);
        else if (this.paletteOpen()) this.paletteOpen.set(false);
        else void this.stopRun();
      }
    });
  }

  async refreshProjects(): Promise<void> {
    await this.request(async () => {
      const registry = await this.get<ProjectRegistry>("/api/projects");
      this.projects.set(registry.projects ?? []);
      this.activeProjectId.set(registry.activeProjectId ?? registry.projects?.[0]?.id);
    });
  }

  async addProject(): Promise<void> {
    const path = this.projectPath.trim();
    if (!path) {
      this.error.set("Укажите путь к проекту.");
      return;
    }
    await this.request(async () => {
      const registry = await this.post<ProjectRegistry>("/api/projects", { path });
      this.projects.set(registry.projects ?? []);
      this.activeProjectId.set(registry.activeProjectId);
      this.projectPath = "";
      this.addFormOpen.set(false);
    });
  }

  async openCommandList(): Promise<void> {
    await this.request(async () => {
      const config = await this.get<AppConfig>("/api/config");
      this.config.set(config);
      this.commandListOpen.set(true);
    });
  }

  commandTeam(command: CommandConfig): TeamConfig | undefined {
    return this.config()?.teams.find((team) => team.name === command.team);
  }

  commandEmployees(command: CommandConfig): Array<{ name: string; role: string }> {
    const config = this.config();
    const team = this.commandTeam(command);
    if (!config || !team) return [];
    const names = team.members?.length ? team.members : [...new Set(Object.values(team.flow.steps).map((step) => step.employee))];
    return names.map((name) => {
      const employee = config.employees.find((item) => item.name === name);
      return { name, role: employee?.roles?.join(", ") || employee?.role || "роль не указана" };
    });
  }

  commandSteps(command: CommandConfig): Array<{ name: string; employee: string; role?: string }> {
    const team = this.commandTeam(command);
    return Object.entries(team?.flow.steps ?? {}).map(([name, step]) => ({ name, employee: step.employee, role: step.role }));
  }

  async removeProject(project: ProjectEntry, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!confirm(`Убрать проект из списка ai-team?\n\n${project.name}`)) return;
    const wasActive = project.id === this.activeProjectId();
    await this.request(async () => {
      const registry = await this.delete<ProjectRegistry>(`/api/projects/${encodeURIComponent(project.id)}`);
      this.projects.set(registry.projects ?? []);
      this.activeProjectId.set(registry.activeProjectId ?? registry.projects?.[0]?.id);
      if (wasActive) this.screen.set("projects");
    });
  }

  async openProject(project: ProjectEntry): Promise<void> {
    await this.request(async () => {
      const registry = await this.post<ProjectRegistry>(`/api/projects/${encodeURIComponent(project.id)}/select`, {});
      this.projects.set(registry.projects ?? []);
      this.activeProjectId.set(registry.activeProjectId);
      await this.loadWorkspace();
      this.screen.set("workspace");
    });
  }

  async loadWorkspace(): Promise<void> {
    const config = await this.get<AppConfig>("/api/config");
    this.config.set(config);
    this.command.set(config.settings?.ui?.defaultCommand ?? config.commands[0]?.name);
    this.providerCommand = config.settings?.provider?.command ?? "";
    if (!this.currentRunId()) {
      this.doneSteps.set(new Set());
      this.currentStep.set(undefined);
      this.worker.set("ожидание");
      this.workerDetail.set("");
      this.processNote.set("Ожидаю задачу.");
      this.publicReasoning.set("");
      this.providerResult.set("");
    }
    await this.refreshTasks();
    const latestTask = this.tasks()[0];
    if (latestTask) await this.loadTask(latestTask.id);
    else await this.newTask();
  }

  async newTask(): Promise<void> {
    await this.request(async () => {
      const data = await this.post<{ session: { id: string } }>("/api/sessions", {});
      await this.loadTask(data.session.id);
    });
  }

  async refreshTasks(): Promise<void> {
    const data = await this.get<{ sessions: TaskEntry[] }>("/api/sessions");
    this.tasks.set(data.sessions ?? []);
  }

  async loadTask(id: string): Promise<void> {
    await this.request(async () => {
      const data = await this.get<{ messages: TaskMessage[] }>(`/api/sessions/${encodeURIComponent(id)}`);
      this.taskId.set(id);
      this.timeline.set((data.messages ?? []).map((message) => ({
        role: message.role === "assistant" ? (message.kind === "step_result" ? `результат ${message.step ?? "шага"}` : "ассистент") : message.role === "user" ? "вы" : "событие",
        content: renderTaskMessage(message),
        kind: message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "event"
      })));
      if (this.timeline().length === 0) this.chatEmptyText.set("Опишите, что нужно сделать. Команда начнёт работу после отправки.");
      this.scrollTimelineToBottom();
      await this.refreshTasks();
      this.taskListOpen.set(false);
    });
  }

  async saveProvider(): Promise<void> {
    await this.request(async () => {
      await this.post("/api/provider", { command: this.providerCommand });
      const config = await this.get<AppConfig>("/api/config");
      this.config.set(config);
      this.providerCommand = config.settings?.provider?.command ?? "";
    });
  }

  async clearProvider(): Promise<void> {
    this.providerCommand = "";
    await this.saveProvider();
  }

  async runTask(): Promise<void> {
    const input = this.taskText.trim();
    if (!input) return;
    if (!this.command()) {
      this.error.set("Сначала выберите команду.");
      return;
    }
    this.taskText = "";
    this.pushMessage("вы", input, "user");
    this.doneSteps.set(new Set());
    this.currentStep.set(undefined);
    this.worker.set("запуск");
    this.workerDetail.set("");
    this.processNote.set("Запуск команды и подготовка первого исполнителя.");
    this.publicReasoning.set("");
    this.providerResult.set("");
    this.runStartedAt.set(Date.now());

    await this.request(async () => {
      const run = await this.post<{ runId: string }>("/api/runs", { command: this.command(), input, sessionId: this.taskId() });
      this.currentRunId.set(run.runId);
      this.currentRunTaskId.set(this.taskId());
      this.attachRunEvents(run.runId);
    });
  }

  async stopRun(): Promise<void> {
    const runId = this.currentRunId();
    if (!runId) return;
    await this.post(`/api/runs/${encodeURIComponent(runId)}/stop`, {});
  }

  canSend(): boolean {
    return Boolean(this.taskText.trim());
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (this.canSend()) void this.runTask();
  }

  backToProjects(): void {
    this.paletteOpen.set(false);
    this.taskListOpen.set(false);
    this.screen.set("projects");
  }

  selectCommand(commandName: string): void {
    this.command.set(commandName);
    this.paletteOpen.set(false);
  }

  newCommand(): void {
    this.commandOriginalName = "";
    this.commandDraft = { name: "", team: "", description: "", task_template: "{{input}}" };
    this.commandDraftRoles = [{ name: "builder", prompt: "Опишите обязанности роли." }];
    this.commandDraftEmployees = [{ name: "employee-1", rolesText: "builder", backend: "opencode", model: "gpt-5.5" }];
    this.commandDraftSteps = [{ name: "work", employee: "employee-1", role: "builder" }];
    this.commandEditorOpen.set(true);
  }

  editCommand(): void {
    const command = this.config()?.commands.find((item) => item.name === this.command());
    if (!command) {
      this.error.set("Сначала выберите команду.");
      return;
    }
    this.commandOriginalName = command.name;
    this.commandDraft = {
      name: command.name,
      team: command.team,
      description: command.description ?? "",
      task: command.task ?? "",
      task_template: command.task_template ?? ""
    };
    const team = this.config()?.teams.find((item) => item.name === command.team);
    const employees = this.teamMembers().map((member) => member.employee).filter(Boolean) as EmployeeConfig[];
    this.commandDraftRoles = Object.entries(this.config()?.roles ?? {})
      .filter(([role]) => employees.some((employee) => employee.role === role || employee.roles?.includes(role)))
      .map(([name, prompt]) => ({ name, prompt }));
    this.commandDraftEmployees = employees.map((employee) => ({
      name: employee.name,
      rolesText: (employee.roles?.length ? employee.roles : [employee.role]).join(", "),
      backend: employee.backend,
      model: employee.model,
      extra_instructions: employee.extra_instructions
    }));
    this.commandDraftSteps = Object.entries(team?.flow.steps ?? {}).map(([name, step]) => ({ name, employee: step.employee, role: step.role ?? employees.find((employee) => employee.name === step.employee)?.role ?? "" }));
    this.commandEditorOpen.set(true);
  }

  addRole(): void { this.commandDraftRoles.push({ name: "", prompt: "" }); }
  removeRole(index: number): void { this.commandDraftRoles.splice(index, 1); }
  addEmployee(): void { this.commandDraftEmployees.push({ name: "", rolesText: "", backend: "opencode", model: "gpt-5.5" }); }
  removeEmployee(index: number): void { this.commandDraftEmployees.splice(index, 1); }
  addStep(): void { this.commandDraftSteps.push({ name: "", employee: this.commandDraftEmployees[0]?.name ?? "", role: this.commandDraftRoles[0]?.name ?? "" }); }
  removeStep(index: number): void { this.commandDraftSteps.splice(index, 1); }

  async saveCommand(): Promise<void> {
    await this.request(async () => {
      const teamName = `${this.commandDraft.name}-team`;
      const steps = Object.fromEntries(this.commandDraftSteps.map((step, index) => [step.name, {
        employee: step.employee,
        role: step.role,
        next: this.commandDraftSteps[index + 1]?.name ?? "done"
      }]));
      const employees = this.commandDraftEmployees.map((employee) => {
        const roles = employee.rolesText.split(",").map((role) => role.trim()).filter(Boolean);
        return { ...employee, role: roles[0] ?? "", roles };
      });
      const body = {
        ...this.commandDraft,
        team: teamName,
        team_config: { name: teamName, members: employees.map((employee) => employee.name), flow: { start: this.commandDraftSteps[0]?.name ?? "", steps } },
        employees,
        roles: Object.fromEntries(this.commandDraftRoles.map((role) => [role.name, role.prompt]))
      };
      const config = this.commandOriginalName
        ? await this.put<AppConfig>(`/api/commands/${encodeURIComponent(this.commandOriginalName)}`, body)
        : await this.post<AppConfig>("/api/commands", body);
      this.config.set(config);
      this.command.set(body.name);
      this.commandEditorOpen.set(false);
    });
  }

  private attachRunEvents(runId: string): void {
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Record<string, string>;
      if (payload["type"] === "step_started") {
        this.currentStep.set(payload["step"]);
        this.worker.set(payload["employee"] ?? "исполнитель");
        this.workerDetail.set(`${payload["step"]} · ${payload["role"]}`);
        this.processNote.set(`Сейчас работает ${payload["employee"]}. Роль: ${payload["role"]}. Шаг: ${payload["step"]}.`);
        this.pushRunMessage("событие", `${payload["employee"]} начал шаг ${payload["step"]}`, "event");
      } else if (payload["type"] === "step_completed") {
        const next = new Set(this.doneSteps());
        next.add(payload["step"] ?? "");
        this.doneSteps.set(next);
        this.processNote.set(`${payload["employee"]} завершил шаг ${payload["step"]} со статусом ${payload["status"]}.`);
        this.pushRunMessage("событие", `${payload["employee"]} завершил шаг ${payload["step"]} · ${payload["status"]}`, "event");
        if (payload["summary"]) {
          this.providerResult.set(payload["summary"]);
          this.pushRunMessage(`результат ${payload["step"]}`, payload["summary"], "assistant");
        }
        if (payload["reasoning"]) this.publicReasoning.set(payload["reasoning"]);
      } else if (payload["type"] === "result") {
        const reasoning = payload["reasoning"] || "Provider не вернул Public Reasoning.";
        const summary = payload["summary"];
        this.publicReasoning.set(reasoning);
        if (summary) {
          this.providerResult.set(summary);
          const shouldDuplicate = this.currentRunTaskId() === this.taskId() && !this.timeline().some((message) => message.kind === "assistant" && message.content === summary);
          if (shouldDuplicate) this.pushRunMessage("результат", summary, "assistant");
        } else {
          this.providerResult.set("Provider не вернул отдельный результат, показано только публичное обоснование.");
        }
        this.pushRunMessage("обоснование", reasoning, "reasoning");
      } else if (payload["type"] === "run_completed") {
        this.currentRunId.set(undefined);
        this.currentRunTaskId.set(undefined);
        this.currentStep.set(undefined);
        this.worker.set("ожидание");
        this.workerDetail.set("");
        this.processNote.set(`Запуск завершён со статусом ${payload["status"] ?? "done"}.`);
        this.runStartedAt.set(undefined);
        this.lastRun.set({ runId: payload["runId"] ?? runId, status: payload["status"] ?? "done" });
        source.close();
        void this.refreshTasks();
      } else if (payload["type"] === "error") {
        this.pushRunMessage("ошибка", payload["message"] ?? "Неизвестная ошибка", "event");
        this.worker.set("ожидание");
        this.processNote.set("Запуск остановлен или завершился ошибкой.");
        this.runStartedAt.set(undefined);
        this.currentRunId.set(undefined);
        this.currentRunTaskId.set(undefined);
        source.close();
      }
    };
    source.onerror = () => {
      this.error.set("Соединение с событиями запуска потеряно.");
      source.close();
    };
  }

  private pushMessage(role: string, content: string, kind: string): void {
    const next = [...this.timeline()];
    next.push({ role, content, kind });
    this.timeline.set(next);
    this.scrollTimelineToBottom();
  }

  private pushRunMessage(role: string, content: string, kind: string): void {
    if (this.currentRunTaskId() !== this.taskId()) return;
    this.pushMessage(role, content, kind);
  }

  private scrollTimelineToBottom(): void {
    window.setTimeout(() => {
      const element = this.timelineContainer?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }

  private async request<T>(callback: () => Promise<T>): Promise<T | undefined> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      return await callback();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  private get<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => this.http.get<T>(url, { responseType: "json" }).subscribe({ next: resolve, error: (error: unknown) => reject(httpError(error)) }));
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return new Promise((resolve, reject) => this.http.post<T>(url, body, { responseType: "json" }).subscribe({ next: resolve, error: (error: unknown) => reject(httpError(error)) }));
  }

  private put<T>(url: string, body: unknown): Promise<T> {
    return new Promise((resolve, reject) => this.http.put<T>(url, body, { responseType: "json" }).subscribe({ next: resolve, error: (error: unknown) => reject(httpError(error)) }));
  }

  private delete<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => this.http.delete<T>(url, { responseType: "json" }).subscribe({ next: resolve, error: (error: unknown) => reject(httpError(error)) }));
  }
}

function httpError(error: unknown): Error {
  if (typeof error === "object" && error && "error" in error) {
    const value = (error as { error?: unknown }).error;
    if (typeof value === "string") return new Error(value);
    if (value && typeof value === "object" && "message" in value) return new Error(String((value as { message: unknown }).message));
  }
  return new Error("Запрос не выполнен");
}

function renderTaskMessage(message: TaskMessage): string {
  if (message.kind === "step_result") {
    return [
      message.content ?? "",
      message.reasoning ? `\n\nПубличное обоснование:\n${message.reasoning}` : ""
    ].join("").trim();
  }
  return message.content ?? "";
}
