import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { ProjectsPage } from "./pages/projects/projects.page";
import type { ProjectEntry, ProjectRegistry } from "./shared/models/app.models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, ProjectsPage],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  private readonly http = inject(HttpClient);

  readonly projects = signal<ProjectEntry[]>([]);
  readonly activeProjectId = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly addFormOpen = signal(false);

  projectPath = "";

  constructor() {
    void this.refreshProjects();
  }

  async refreshProjects(): Promise<void> {
    await this.request(async () => {
      const registry = await this.get<ProjectRegistry>("/api/projects");
      this.applyRegistry(registry);
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
      this.applyRegistry(registry);
      this.projectPath = "";
      this.addFormOpen.set(false);
    });
  }

  async openProject(project: ProjectEntry): Promise<void> {
    await this.request(async () => {
      const registry = await this.post<ProjectRegistry>(`/api/projects/${encodeURIComponent(project.id)}/select`, {});
      this.applyRegistry(registry);
    });
  }

  async removeProject(project: ProjectEntry, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!confirm(`Убрать проект из списка ai-team?\n\n${project.name}`)) return;
    await this.request(async () => {
      const registry = await this.delete<ProjectRegistry>(`/api/projects/${encodeURIComponent(project.id)}`);
      this.applyRegistry(registry);
    });
  }

  private applyRegistry(registry: ProjectRegistry): void {
    this.projects.set(registry.projects ?? []);
    this.activeProjectId.set(registry.activeProjectId ?? registry.projects?.[0]?.id);
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
    return new Promise((resolve, reject) => this.http.get<T>(url, { responseType: "json" }).subscribe({ next: resolve, error: (errorValue: unknown) => reject(httpError(errorValue)) }));
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return new Promise((resolve, reject) => this.http.post<T>(url, body, { responseType: "json" }).subscribe({ next: resolve, error: (errorValue: unknown) => reject(httpError(errorValue)) }));
  }

  private delete<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => this.http.delete<T>(url, { responseType: "json" }).subscribe({ next: resolve, error: (errorValue: unknown) => reject(httpError(errorValue)) }));
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
