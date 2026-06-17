import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonComponent } from "../../shared/components/button/button.component";
import { ChatTimelineComponent } from "../../shared/components/chat-timeline/chat-timeline.component";
import type { AppConfig, CommandConfig, ProjectEntry, TaskEntry, TeamMemberView, TimelineMessage } from "../../shared/models/app.models";

@Component({
  selector: "app-workspace-page",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, ChatTimelineComponent],
  templateUrl: "./workspace.page.html",
  styleUrl: "./workspace.page.scss"
})
export class WorkspacePage {
  @Input() project?: ProjectEntry;
  @Input() config?: AppConfig;
  @Input() command?: string;
  @Input() worker = "ожидание";
  @Input() workerDetail = "";
  @Input() timeline: TimelineMessage[] = [];
  @Input() hasOlderMessages = false;
  @Input() loadingOlderMessages = false;
  @Input() chatEmptyText = "";
  @Input() taskText = "";
  @Input() providerCommand = "";
  @Input() teamMembers: TeamMemberView[] = [];
  @Input() steps: Array<{ name: string; employee: string; role?: string }> = [];
  @Input() currentStep?: string;
  @Input() doneSteps = new Set<string>();
  @Input() currentRunId?: string;
  @Input() currentRunTaskId?: string;
  @Input() currentRole?: string;
  @Input() taskId?: string;
  @Input() activeTask?: TaskEntry;
  @Input() processNote = "";
  @Input() providerActivity = "";
  @Input() publicReasoning = "";
  @Input() providerResult = "";
  @Input() elapsedLabel = "-";
  @Input() lastRun?: { runId: string; status: string };
  @Input() canStop = false;

  @Output() backToProjects = new EventEmitter<void>();
  @Output() togglePalette = new EventEmitter<void>();
  @Output() commandChange = new EventEmitter<string>();
  @Output() newCommand = new EventEmitter<void>();
  @Output() editCommand = new EventEmitter<void>();
  @Output() taskTextChange = new EventEmitter<string>();
  @Output() composerKeydown = new EventEmitter<KeyboardEvent>();
  @Output() runTask = new EventEmitter<void>();
  @Output() providerCommandChange = new EventEmitter<string>();
  @Output() saveProvider = new EventEmitter<void>();
  @Output() clearProvider = new EventEmitter<void>();
  @Output() openTasks = new EventEmitter<void>();
  @Output() newTask = new EventEmitter<void>();
  @Output() stopRun = new EventEmitter<void>();
  @Output() scrolledToTop = new EventEmitter<void>();

  @ViewChild(ChatTimelineComponent) private chatTimeline?: ChatTimelineComponent;

  canSend(): boolean { return Boolean(this.taskText.trim()); }
  scrollToBottom(): void { this.chatTimeline?.scrollToBottom(); }
  scrollHeight(): number { return this.chatTimeline?.scrollHeight() ?? 0; }
  preserveTimelineOffset(previousHeight: number): void { this.chatTimeline?.preserveOffset(previousHeight); }
  commandLabel(item: CommandConfig): string { return item.description ? `${item.name} - ${item.description}` : item.name; }
}
