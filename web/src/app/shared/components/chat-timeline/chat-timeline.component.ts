import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import type { TimelineMessage } from "../../models/app.models";

@Component({
  selector: "app-chat-timeline",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./chat-timeline.component.html",
  styleUrl: "./chat-timeline.component.scss"
})
export class ChatTimelineComponent {
  @Input() messages: TimelineMessage[] = [];
  @Input() emptyText = "";
  @Input() hasOlderMessages = false;
  @Input() loadingOlderMessages = false;
  @Output() scrolledToTop = new EventEmitter<void>();

  @ViewChild("timelineContainer") private timelineContainer?: ElementRef<HTMLElement>;

  onScroll(): void {
    const element = this.timelineContainer?.nativeElement;
    if (element && element.scrollTop <= 48) this.scrolledToTop.emit();
  }

  scrollToBottom(): void {
    const scroll = (): void => {
      const element = this.timelineContainer?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    };
    window.requestAnimationFrame(scroll);
    window.setTimeout(scroll, 80);
  }

  preserveOffset(previousHeight: number): void {
    window.requestAnimationFrame(() => {
      const element = this.timelineContainer?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight - previousHeight;
    });
  }

  scrollHeight(): number {
    return this.timelineContainer?.nativeElement.scrollHeight ?? 0;
  }
}
