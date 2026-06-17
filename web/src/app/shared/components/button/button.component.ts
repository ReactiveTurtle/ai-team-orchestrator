import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "app-button",
  standalone: true,
  templateUrl: "./button.component.html",
  styleUrl: "./button.component.scss"
})
export class ButtonComponent {
  @Input() variant: "default" | "primary" | "danger" = "default";
  @Input() type: "button" | "submit" = "button";
  @Input() disabled = false;
  @Input() full = false;
  @Output() pressed = new EventEmitter<Event>();
}
