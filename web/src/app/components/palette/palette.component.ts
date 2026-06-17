import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { CommandConfig } from "../../shared/models/app.models";

@Component({
  selector: "app-palette",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./palette.component.html",
  styleUrl: "./palette.component.scss"
})
export class PaletteComponent {
  @Input() open = false;
  @Input() commands: CommandConfig[] = [];

  @Output() projects = new EventEmitter<void>();
  @Output() tasks = new EventEmitter<void>();
  @Output() newTask = new EventEmitter<void>();
  @Output() selectCommand = new EventEmitter<string>();
  @Output() stopRun = new EventEmitter<void>();
}
