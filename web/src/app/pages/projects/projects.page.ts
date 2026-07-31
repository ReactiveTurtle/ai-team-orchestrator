import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonComponent } from "../../shared/components/button/button.component";
import type { ProjectEntry } from "../../shared/models/app.models";

@Component({
  selector: "app-projects-page",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: "./projects.page.html",
  styleUrl: "./projects.page.scss"
})
export class ProjectsPage {
  @Input() projects: ProjectEntry[] = [];
  @Input() openedProject?: ProjectEntry;
  @Input() settingsOpen = false;
  @Input() settingsProject?: ProjectEntry;
  @Input() addFormOpen = false;
  @Input() projectPath = "";
  @Input() providerCommand = "opencode run";
  @Input() error?: string;

  @Output() addFormOpenChange = new EventEmitter<boolean>();
  @Output() projectPathChange = new EventEmitter<string>();
  @Output() providerCommandChange = new EventEmitter<string>();
  @Output() refreshProjects = new EventEmitter<void>();
  @Output() addProject = new EventEmitter<void>();
  @Output() openProject = new EventEmitter<ProjectEntry>();
  @Output() closeProject = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();
  @Output() closeSettings = new EventEmitter<void>();
  @Output() saveProvider = new EventEmitter<void>();
  @Output() clearProvider = new EventEmitter<void>();
  @Output() removeProject = new EventEmitter<{ project: ProjectEntry; event: Event }>();
}
