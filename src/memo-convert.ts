import type { DashboardCard } from "./types";
import { pathToWikiLink } from "./parser";

function stripMemoBulletPrefix(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("- ")) return line.slice(2);
      if (line.startsWith("> - ")) return `> ${line.slice(4)}`;
      return line;
    })
    .join("\n");
}

function sanitizeFileBaseName(title: string): string {
  let baseName = title.trim();
  baseName = baseName.replace(/\[\[|\]\]/g, "").trim();
  baseName = baseName.split("/").pop() ?? baseName;
  baseName = baseName.split("\\").pop() ?? baseName;
  baseName = baseName.replace(/[<>:"|?*\x00-\x1F]/g, "").replace(/\s+/g, " ").trim();
  return baseName || "Untitled";
}

export function buildMemoNoteContent(
  card: Pick<DashboardCard, "body" | "blockquote">,
): string {
  const rawText = [card.blockquote, card.body].filter(Boolean).join("\n");
  return stripMemoBulletPrefix(rawText).trimEnd();
}

export function buildMemoNotePath(title: string): string {
  return sanitizeFileBaseName(title);
}

export function buildMemoLinkedBody(notePath: string): string {
  return pathToWikiLink(notePath);
}
