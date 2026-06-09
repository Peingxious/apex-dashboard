import { Modal, App } from "obsidian";

export type WidgetType = string;

export class WidgetTypeModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen(): void {
        // Stub: widget type modal
    }

    onClose(): void {
        // Stub
    }
}
