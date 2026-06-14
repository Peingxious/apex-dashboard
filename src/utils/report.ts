import { Notice } from "obsidian";

export function reportError(
  prefix: string,
  message: string,
  err: unknown,
  noticeText?: string,
): void {
  console.error(prefix, message, err);
  if (noticeText) new Notice(noticeText);
}
