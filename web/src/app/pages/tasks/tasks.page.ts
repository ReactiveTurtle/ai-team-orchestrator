import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { ButtonComponent } from "../../shared/components/button/button.component";
import type { ProjectEntry, TaskEntry } from "../../shared/models/app.models";

@Component({
  selector: "app-tasks-page",
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: "./tasks.page.html",
  styleUrl: "./tasks.page.scss"
})
export class TasksPage {
  @Input() project?: ProjectEntry;
  @Input() tasks: TaskEntry[] = [];
  @Input() activeTaskId?: string;
  @Input() currentRunTaskId?: string;
  @Input() currentRunId?: string;
  @Input() error?: string;

  @Output() backToProjects = new EventEmitter<void>();
  @Output() refreshTasks = new EventEmitter<void>();
  @Output() newTask = new EventEmitter<void>();
  @Output() openTask = new EventEmitter<string>();
}
