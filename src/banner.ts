import { App, Modal, Setting, TFile } from "obsidian";
import type { BannerData } from "./types";
import { t } from "./i18n";

/**
 * Resolve an image path to a usable resource URL.
 * Supports:
 * - HTTP/HTTPS URLs (used directly)
 * - Vault-relative paths (resolved via Obsidian API)
 */
export function resolveVaultImage(app: App, path: string): string | null {
  if (!path) return null;
  // If it's already a full URL, use it directly
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  try {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return app.vault.getResourcePath(file);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Render the dashboard banner into the given container.
 * Returns the banner element for further customization.
 * Only renders background image — no quote/author text.
 */
export function renderBanner(
  container: HTMLElement,
  banner: BannerData,
  onEdit: () => void,
  app: App,
): HTMLElement {
  const bannerEl = container.createDiv({ cls: "dashboard-banner" });

  // Background image
  if (banner.image) {
    const resolved = resolveVaultImage(app, banner.image);
    if (resolved) {
      bannerEl.style.backgroundImage = `url("${resolved}")`;
    }
  }

  // Overlay
  const overlay = bannerEl.createDiv({ cls: "dashboard-banner-overlay" });

  // Edit button
  const editBtn = overlay.createEl("button", {
    cls: "dashboard-banner-edit-btn",
    attr: { "aria-label": t("banner.edit") },
  });
  editBtn.setText(t("banner.edit"));
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onEdit();
  });

  return bannerEl;
}

/**
 * Modal for editing banner settings (single image only).
 *
 * v1.4.8: removed the rotation-images UI and `localImages` field.
 * Banner is single-image: `banner.image` is the only user-facing
 * input. The `banner.images` field is still tolerated on read
 * (for users with older dashboard files), but the modal no longer
 * writes it.
 */
export class BannerEditModal extends Modal {
  private banner: BannerData;
  private onSave: (updates: Partial<BannerData>) => void;

  constructor(
    app: App,
    banner: BannerData,
    onSave: (updates: Partial<BannerData>) => void,
    _stylePreset?: string,
  ) {
    super(app);
    this.banner = { ...banner };
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dashboard-banner-edit-modal");

    contentEl.createEl("h2", { text: t("banner.editTitle") });

    // Single image input
    new Setting(contentEl)
      .setName(t("banner.image"))
      .setDesc(t("banner.imageDesc"))
      .addText((text) => {
        text
          .setValue(this.banner.image || "")
          .setPlaceholder(t("banner.imagePlaceholder"))
          .onChange((val) => (this.banner.image = val));
      });

    // Save button
    const saveBtn = contentEl.createEl("button", {
      cls: "dashboard-banner-save-btn",
      text: t("banner.save"),
    });
    saveBtn.addEventListener("click", () => {
      this.onSave({ image: this.banner.image });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
