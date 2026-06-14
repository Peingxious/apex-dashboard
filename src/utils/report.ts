import { Notice } from "obsidian";

export function reportError(
  prefix: string,
  message: string,
  err: unknown,
  noticeText?: string,
): void {
  if (noticeText) new Notice(noticeText);
}
