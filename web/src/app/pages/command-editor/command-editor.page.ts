import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonComponent } from "../../shared/components/button/button.component";
import type { CommandConfig, EditorItem, EmployeeDraft, PipelineStepDraft, RoleDraft } from "../../shared/models/app.models";

@Component({
  selector: "app-command-editor-page",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: "./command-editor.page.html",
  styleUrl: "./command-editor.page.scss"
})
export class CommandEditorPage {
  @Input({ required: true }) commandDraft!: CommandConfig;
  @Input() commandOriginalName = "";
  @Input() roles: RoleDraft[] = [];
  @Input() employees: EmployeeDraft[] = [];
  @Input() steps: PipelineStepDraft[] = [];
  @Input() selectedPipelineStepIndex = 0;
  @Input() selectedEditorItem: EditorItem = { type: "command" };
  @Input() draggedPipelineStepIndex?: number;
  @Input() draggedEmployeeIndex?: number;
  @Input() pipelineDropTargetIndex?: number;
  @Input() selectedRole?: RoleDraft;
  @Input() selectedEmployee?: EmployeeDraft;
  @Input() selectedStep?: PipelineStepDraft;

  @Output() closeEditor = new EventEmitter<void>();
  @Output() saveCommand = new EventEmitter<void>();
  @Output() selectCommandSettings = new EventEmitter<void>();
  @Output() addRole = new EventEmitter<void>();
  @Output() selectRole = new EventEmitter<number>();
  @Output() removeRole = new EventEmitter<number>();
  @Output() addEmployee = new EventEmitter<void>();
  @Output() selectEmployee = new EventEmitter<number>();
  @Output() removeEmployee = new EventEmitter<number>();
  @Output() addStep = new EventEmitter<void>();
  @Output() selectStep = new EventEmitter<number>();
  @Output() removeStep = new EventEmitter<number>();
  @Output() moveStep = new EventEmitter<{ index: number; direction: -1 | 1 }>();
  @Output() pipelineDragStart = new EventEmitter<{ event: DragEvent; index: number }>();
  @Output() employeeDragStart = new EventEmitter<{ event: DragEvent; index: number }>();
  @Output() pipelineDragOver = new EventEmitter<{ event: DragEvent; index: number }>();
  @Output() pipelineDrop = new EventEmitter<{ event: DragEvent; index: number }>();
  @Output() clearDragState = new EventEmitter<void>();

  selectedIndex(): number { return this.selectedEditorItem.index ?? 0; }
  canSave(): boolean { return Boolean(this.commandDraft.name.trim() && this.commandDraft.task_template?.trim() && this.steps.length > 0); }
}
