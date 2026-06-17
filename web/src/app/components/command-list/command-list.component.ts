import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { ButtonComponent } from "../../shared/components/button/button.component";
import type { CommandConfig } from "../../shared/models/app.models";

@Component({
  selector: "app-command-list",
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: "./command-list.component.html",
  styleUrl: "./command-list.component.scss"
})
export class CommandListComponent {
  @Input() open = false;
  @Input() commands: CommandConfig[] = [];
  @Input() employeesCount: (command: CommandConfig) => number = () => 0;
  @Input() stepsCount: (command: CommandConfig) => number = () => 0;

  @Output() createCommand = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() selectCommand = new EventEmitter<string>();
}
