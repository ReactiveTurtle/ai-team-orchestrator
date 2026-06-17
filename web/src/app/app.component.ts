import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, ViewChild, computed, inject, signal } from "@angular/core";
import { CommandListComponent } from "./components/command-list/command-list.component";
import { PaletteComponent } from "./components/palette/palette.component";
import { CommandEditorPage } from "./pages/command-editor/command-editor.page";
import { ProjectsPage } from "./pages/projects/projects.page";
import { TasksPage } from "./pages/tasks/tasks.page";
import { WorkspacePage } from "./pages/workspace/workspace.page";
import type { AppConfig, CommandConfig, EditorItem, EmployeeConfig, EmployeeDraft, PipelineStepDraft, ProjectEntry, ProjectRegistry, ProviderEvent, RoleDraft, Screen, TaskMessage, TaskPage, TaskEntry, TeamConfig, TimelineMessage } from "./shared/models/app.models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, ProjectsPage, TasksPage, WorkspacePage, CommandEditorPage, PaletteComponent, CommandListComponent],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  private readonly http = inject(HttpClient);
  private readonly chatPageSize = 50;

  @ViewChild(WorkspacePage) private workspacePage?: WorkspacePage;

  readonly screen = signal<Screen>("projects");
  readonly projects = signal<ProjectEntry[]>([]);
  readonly activeProjectId = signal<string | undefined>(undefined);
  readonly config = signal<AppConfig | undefined>(undefined);
  readonly command = signal<string | undefined>(undefined);
  readonly tasks = signal<TaskEntry[]>([]);
  readonly taskId = signal<string | undefined>(undefined);
  readonly timeline = signal<TimelineMessage[]>([]);
  readonly hasOlderMessages = signal(false);
  readonly loadingOlderMessages = signal(false);
  readonly chatEmptyText = signal("Опишите, что нужно сделать. Команда начнёт работу после отправки.");
  readonly currentRunId = signal<string | undefined>(undefined);
  readonly currentRunTaskId = signal<string | undefined>(undefined);
  readonly currentStep = signal<string | undefined>(undefined);
  readonly currentRole = signal<string | undefined>(undefined);
  readonly doneSteps = signal<Set<string>>(new Set());
  readonly worker = signal("ожидание");
  readonly workerDetail = signal("");
  readonly processNote = signal("Ожидаю задачу.");
  readonly providerActivity = signal("");
  readonly publicReasoning = signal("");
  readonly providerResult = signal("");
  readonly runStartedAt = signal<number | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly lastRun = signal<{ runId: string; status: string } | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly addFormOpen = signal(false);
  readonly paletteOpen = signal(false);
  readonly commandEditorOpen = signal(false);
  readonly commandListOpen = signal(false);
  readonly selectedPipelineStepIndex = signal(0);
  readonly draggedPipelineStepIndex = signal<number | undefined>(undefined);
  readonly draggedEmployeeIndex = signal<number | undefined>(undefined);
  readonly pipelineDropTargetIndex = signal<number | undefined>(undefined);
  readonly selectedEditorItem = signal<{ type: "command" | "role" | "employee" | "step"; index?: number }>({ type: "command" });

  projectPath = "";
  providerCommand = "";
  taskText = "";
  private timelineOffset = 0;
  commandOriginalName = "";
  commandDraft: CommandConfig = { name: "", team: "", description: "", task_template: "" };
  commandDraftRoles: RoleDraft[] = [];
  commandDraftEmployees: EmployeeDraft[] = [];
  commandDraftSteps: PipelineStepDraft[] = [];

  readonly activeProject = computed(() => this.projects().find((project) => project.id === this.activeProjectId()));
  readonly activeTask = computed(() => this.tasks().find((task) => task.id === this.taskId()));
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
  readonly selectedRole = computed(() => this.selectedEditorItem().type === "role" ? this.commandDraftRoles[this.selectedEditorItem().index ?? -1] : undefined);
  readonly selectedEmployee = computed(() => this.selectedEditorItem().type === "employee" ? this.commandDraftEmployees[this.selectedEditorItem().index ?? -1] : undefined);
  readonly selectedStep = computed(() => this.selectedEditorItem().type === "step" ? this.commandDraftSteps[this.selectedEditorItem().index ?? -1] : undefined);
  readonly commandEmployeeCount = (command: CommandConfig): number => this.commandEmployees(command).length;
  readonly commandStepCount = (command: CommandConfig): number => this.commandSteps(command).length;
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
        if (this.paletteOpen()) this.paletteOpen.set(false);
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
      await this.loadWorkspace(false);
      this.screen.set("tasks");
    });
  }

  async loadWorkspace(loadLatestTask = true): Promise<void> {
    const config = await this.get<AppConfig>("/api/config");
    this.config.set(config);
    this.command.set(config.settings?.ui?.defaultCommand ?? config.commands[0]?.name);
    this.providerCommand = config.settings?.provider?.command ?? "";
    if (!this.currentRunId()) {
      this.doneSteps.set(new Set());
      this.currentStep.set(undefined);
      this.currentRole.set(undefined);
      this.worker.set("ожидание");
      this.workerDetail.set("");
      this.processNote.set("Ожидаю задачу.");
      this.providerActivity.set("");
      this.publicReasoning.set("");
      this.providerResult.set("");
    }
    await this.refreshTasks();
    if (!loadLatestTask) return;
    const latestTask = this.tasks()[0];
    if (latestTask) await this.loadTask(latestTask.id);
    else await this.newTask();
  }

  async newTask(): Promise<void> {
    await this.request(async () => {
      const data = await this.post<{ session: { id: string } }>("/api/sessions", {});
      await this.loadTask(data.session.id, true);
    });
  }

  async refreshTasks(): Promise<void> {
    const data = await this.get<{ sessions: TaskEntry[] }>("/api/sessions");
    this.tasks.set(data.sessions ?? []);
  }

  async loadTask(id: string, openChat = true): Promise<void> {
    await this.request(async () => {
      const data = await this.get<TaskPage>(`/api/sessions/${encodeURIComponent(id)}?limit=${this.chatPageSize}`);
      this.taskId.set(id);
      this.timelineOffset = data.offset;
      this.hasOlderMessages.set(data.hasMoreBefore);
      this.timeline.set((data.messages ?? []).map((message) => ({
        role: timelineRole(message),
        content: renderTaskMessage(message),
        kind: timelineKind(message)
      })));
      if (this.timeline().length === 0) this.chatEmptyText.set("Опишите, что нужно сделать. Команда начнёт работу после отправки.");
      await this.refreshTasks();
      if (openChat) this.screen.set("workspace");
      this.scrollTimelineToBottom();
    });
  }

  openTasksPage(): void {
    this.paletteOpen.set(false);
    this.screen.set("tasks");
    void this.refreshTasks();
  }

  async onTimelineScroll(): Promise<void> {
    const id = this.taskId();
    if (!id || !this.hasOlderMessages() || this.loadingOlderMessages()) return;
    this.loadingOlderMessages.set(true);
    const previousHeight = this.workspacePage?.scrollHeight() ?? 0;
    try {
      const limit = Math.min(this.chatPageSize, this.timelineOffset);
      const offset = Math.max(0, this.timelineOffset - limit);
      const data = await this.get<TaskPage>(`/api/sessions/${encodeURIComponent(id)}?offset=${offset}&limit=${limit}`);
      const older = (data.messages ?? []).map((message) => ({
        role: timelineRole(message),
        content: renderTaskMessage(message),
        kind: timelineKind(message)
      }));
      this.timelineOffset = data.offset;
      this.hasOlderMessages.set(data.hasMoreBefore);
      this.timeline.set([...older, ...this.timeline()]);
      this.workspacePage?.preserveTimelineOffset(previousHeight);
    } finally {
      this.loadingOlderMessages.set(false);
    }
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
    this.currentRole.set(undefined);
    this.worker.set("запуск");
    this.workerDetail.set("");
    this.processNote.set("Запуск команды и подготовка первого исполнителя.");
    this.providerActivity.set("");
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
    this.screen.set("projects");
  }

  selectCommand(commandName: string): void {
    this.command.set(commandName);
    this.paletteOpen.set(false);
    void this.openTaskListForCommand();
  }

  chooseCommandFromList(commandName: string): void {
    this.command.set(commandName);
    this.commandListOpen.set(false);
    void this.openTaskListForCommand();
  }

  private async openTaskListForCommand(): Promise<void> {
    await this.refreshTasks();
    this.screen.set("tasks");
  }

  newCommand(): void {
    this.commandOriginalName = "";
    this.commandDraft = { name: "Новая команда", team: "", description: "Опишите назначение команды.", task_template: "{{input}}" };
    this.commandDraftRoles = [{ name: "исполнитель", prompt: "Опишите обязанности роли." }];
    this.commandDraftEmployees = [{ name: "сотрудник 1", rolesText: "исполнитель", backend: "opencode", model: "gpt-5.5" }];
    this.commandDraftSteps = [{ name: "работа", employee: "сотрудник 1", role: "исполнитель" }];
    this.selectedPipelineStepIndex.set(0);
    this.selectedEditorItem.set({ type: "command" });
    this.commandListOpen.set(false);
    this.paletteOpen.set(false);
    this.screen.set("command-editor");
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
    this.selectedPipelineStepIndex.set(0);
    this.selectedEditorItem.set({ type: "command" });
    this.commandListOpen.set(false);
    this.paletteOpen.set(false);
    this.screen.set("command-editor");
  }

  addRole(): void {
    this.commandDraftRoles.push({ name: "", prompt: "" });
    this.selectedEditorItem.set({ type: "role", index: this.commandDraftRoles.length - 1 });
  }

  removeRole(index: number): void {
    this.commandDraftRoles.splice(index, 1);
    this.selectedEditorItem.set({ type: "command" });
  }

  addEmployee(): void {
    this.commandDraftEmployees.push({ name: "", rolesText: "", backend: "opencode", model: "gpt-5.5" });
    this.selectedEditorItem.set({ type: "employee", index: this.commandDraftEmployees.length - 1 });
  }

  removeEmployee(index: number): void {
    this.commandDraftEmployees.splice(index, 1);
    this.selectedEditorItem.set({ type: "command" });
  }

  addStep(): void {
    this.commandDraftSteps.push({ name: "", employee: this.commandDraftEmployees[0]?.name ?? "", role: this.commandDraftRoles[0]?.name ?? "" });
    this.selectPipelineStep(this.commandDraftSteps.length - 1);
  }

  removeStep(index: number): void {
    this.commandDraftSteps.splice(index, 1);
    this.selectedPipelineStepIndex.set(Math.max(0, Math.min(this.selectedPipelineStepIndex(), this.commandDraftSteps.length - 1)));
    this.selectedEditorItem.set(this.commandDraftSteps.length > 0 ? { type: "step", index: this.selectedPipelineStepIndex() } : { type: "command" });
  }

  selectPipelineStep(index: number): void {
    this.selectedPipelineStepIndex.set(index);
    this.selectedEditorItem.set({ type: "step", index });
  }

  selectCommandSettings(): void { this.selectedEditorItem.set({ type: "command" }); }
  selectRole(index: number): void { this.selectedEditorItem.set({ type: "role", index }); }
  selectEmployee(index: number): void { this.selectedEditorItem.set({ type: "employee", index }); }

  closeCommandEditor(): void {
    this.screen.set("projects");
    this.commandListOpen.set(true);
  }

  movePipelineStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.commandDraftSteps.length) return;
    this.reorderPipelineStep(index, target);
  }

  onPipelineDragStart(event: DragEvent, index: number): void {
    this.draggedEmployeeIndex.set(undefined);
    this.draggedPipelineStepIndex.set(index);
    this.pipelineDropTargetIndex.set(index);
    this.selectPipelineStep(index);
    event.dataTransfer?.setData("application/x-ai-team-step-index", String(index));
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  onEmployeeDragStart(event: DragEvent, index: number): void {
    this.draggedPipelineStepIndex.set(undefined);
    this.draggedEmployeeIndex.set(index);
    this.pipelineDropTargetIndex.set(undefined);
    event.dataTransfer?.setData("application/x-ai-team-employee-index", String(index));
    event.dataTransfer?.setData("text/plain", this.commandDraftEmployees[index]?.name ?? "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }

  onPipelineDragOver(event: DragEvent, index: number): void {
    if (this.draggedPipelineStepIndex() === undefined && this.draggedEmployeeIndex() === undefined) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.draggedEmployeeIndex() === undefined ? "move" : "copy";
    this.pipelineDropTargetIndex.set(index);
  }

  onPipelineDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const employeeIndex = this.draggedEmployeeIndex();
    const from = this.draggedPipelineStepIndex();
    this.clearPipelineDragState();
    if (employeeIndex !== undefined) {
      this.assignEmployeeToStep(employeeIndex, index);
      return;
    }
    if (from === undefined || from === index) return;
    this.reorderPipelineStep(from, index);
  }

  clearPipelineDragState(): void {
    this.draggedPipelineStepIndex.set(undefined);
    this.draggedEmployeeIndex.set(undefined);
    this.pipelineDropTargetIndex.set(undefined);
  }

  private assignEmployeeToStep(employeeIndex: number, stepIndex: number): void {
    const employee = this.commandDraftEmployees[employeeIndex];
    const step = this.commandDraftSteps[stepIndex];
    if (!employee || !step) return;
    step.employee = employee.name;
    if (!step.role) step.role = employee.rolesText.split(",").map((role) => role.trim()).filter(Boolean)[0] ?? "";
    this.selectPipelineStep(stepIndex);
  }

  private reorderPipelineStep(index: number, target: number): void {
    if (target < 0 || target >= this.commandDraftSteps.length || index === target) return;
    const next = [...this.commandDraftSteps];
    const [step] = next.splice(index, 1);
    next.splice(target, 0, step);
    this.commandDraftSteps = next;
    const selected = this.selectedEditorItem();
    if (selected.type !== "step") {
      this.selectedPipelineStepIndex.set(target);
      return;
    }
    const selectedIndex = selected.index ?? this.selectedPipelineStepIndex();
    let nextSelectedIndex = selectedIndex;
    if (selectedIndex === index) nextSelectedIndex = target;
    else if (index < selectedIndex && selectedIndex <= target) nextSelectedIndex = selectedIndex - 1;
    else if (target <= selectedIndex && selectedIndex < index) nextSelectedIndex = selectedIndex + 1;
    this.selectPipelineStep(nextSelectedIndex);
  }

  async saveCommand(): Promise<void> {
    await this.request(async () => {
      const teamName = `${commandSlug(this.commandDraft.name)}-team`;
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
      this.screen.set("projects");
      this.commandListOpen.set(true);
    });
  }

  private attachRunEvents(runId: string): void {
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      if (payload["type"] === "step_started") {
        const step = String(payload["step"] ?? "");
        const employee = String(payload["employee"] ?? "исполнитель");
        const role = String(payload["role"] ?? "");
        this.currentStep.set(step);
        this.currentRole.set(role || undefined);
        this.worker.set(employee);
        this.workerDetail.set(`${step} · ${role}`);
        this.processNote.set(`Сейчас работает ${employee}. Роль: ${role}. Шаг: ${step}.`);
      } else if (payload["type"] === "provider_event") {
        this.handleProviderEvent(payload["event"] as ProviderEvent);
      } else if (payload["type"] === "step_completed") {
        const next = new Set(this.doneSteps());
        const step = String(payload["step"] ?? "");
        const employee = String(payload["employee"] ?? "исполнитель");
        const status = String(payload["status"] ?? "");
        next.add(step);
        this.doneSteps.set(next);
        this.processNote.set(`${employee} завершил шаг ${step} со статусом ${status}.`);
        if (typeof payload["summary"] === "string") {
          this.providerResult.set(payload["summary"]);
          this.pushRunMessage(`результат ${step}`, payload["summary"], "assistant");
        }
        if (typeof payload["reasoning"] === "string") this.publicReasoning.set(payload["reasoning"]);
      } else if (payload["type"] === "result") {
        const reasoning = typeof payload["reasoning"] === "string" ? payload["reasoning"] : "Provider не вернул Public Reasoning.";
        const summary = typeof payload["summary"] === "string" ? payload["summary"] : undefined;
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
        this.currentRole.set(undefined);
        this.worker.set("ожидание");
        this.workerDetail.set("");
        const status = String(payload["status"] ?? "done");
        this.processNote.set(`Запуск завершён со статусом ${status}.`);
        this.runStartedAt.set(undefined);
        this.lastRun.set({ runId: String(payload["runId"] ?? runId), status });
        source.close();
        void this.refreshTasks();
      } else if (payload["type"] === "error") {
        this.error.set(String(payload["message"] ?? "Неизвестная ошибка"));
        this.worker.set("ожидание");
        this.processNote.set("Запуск остановлен или завершился ошибкой.");
        this.providerActivity.set("");
        this.runStartedAt.set(undefined);
        this.currentRunId.set(undefined);
        this.currentRunTaskId.set(undefined);
        this.currentStep.set(undefined);
        this.currentRole.set(undefined);
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

  private handleProviderEvent(event: ProviderEvent): void {
    if (event.type === "reasoning") {
      this.publicReasoning.set(event.text);
      this.pushRunMessage("рассуждение", event.text, "reasoning");
      return;
    }
    if (event.type === "text") {
      this.providerResult.set(event.text);
      this.pushRunMessage("ответ", event.text, "assistant");
      return;
    }
    if (event.type === "tool") {
      const content = [event.tool, event.status, event.title].filter(Boolean).join(" · ") || "OpenCode tool event";
      this.providerActivity.set(content);
      this.processNote.set(content);
      return;
    }
    if (event.type === "step") {
      const content = event.reason ? `OpenCode step ${event.status}: ${event.reason}` : `OpenCode step ${event.status}`;
      this.providerActivity.set(content);
      this.processNote.set(content);
    }
  }

  private scrollTimelineToBottom(): void {
    this.workspacePage?.scrollToBottom();
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

function timelineRole(message: TaskMessage): string {
  if (message.kind === "step_result") return `результат ${message.step ?? "шага"}`;
  if (message.kind === "provider_reasoning") return "рассуждение";
  if (message.kind === "provider_text") return "ответ";
  if (message.kind === "provider_tool") return "инструмент";
  if (message.role === "assistant") return "ассистент";
  if (message.role === "user") return "вы";
  return "событие";
}

function timelineKind(message: TaskMessage): string {
  if (message.kind === "provider_reasoning") return "reasoning";
  if (message.kind === "provider_text" || message.kind === "step_result") return "assistant";
  if (message.role === "assistant") return "assistant";
  if (message.role === "user") return "user";
  return "event";
}

function commandSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "команда";
}
