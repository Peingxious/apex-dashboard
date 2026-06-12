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
 * Modal for editing banner settings (image only).
 */
export class BannerEditModal extends Modal {
  private banner: BannerData;
  private onSave: (updates: Partial<BannerData>) => void;
  private localImages: string[];

  constructor(
    app: App,
    banner: BannerData,
    onSave: (updates: Partial<BannerData>) => void,
    _stylePreset?: string,
  ) {
    super(app);
    this.banner = { ...banner };
    this.onSave = onSave;
    this.localImages = banner.images ? [...banner.images] : [];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dashboard-banner-edit-modal");

    contentEl.createEl("h2", { text: t("banner.editTitle") });

    // Main image
    new Setting(contentEl)
      .setName(t("banner.image"))
      .setDesc(t("banner.imageDesc"))
      .addText((text) => {
        text
          .setValue(this.banner.image || "")
          .setPlaceholder(t("banner.imagePlaceholder"))
          .onChange((val) => (this.banner.image = val));
      });

    // Rotation images
    contentEl.createEl("h3", { text: t("banner.rotationImages") });
    const imagesContainer = contentEl.createDiv({
      cls: "dashboard-banner-images-list",
    });
    this.renderImagesList(imagesContainer);

    const addImageBtn = contentEl.createEl("button", {
      cls: "dashboard-banner-add-btn",
      text: t("banner.addImage"),
    });
    addImageBtn.addEventListener("click", () => {
      this.localImages.push("");
      this.renderImagesList(imagesContainer);
    });

    // Save button
    const saveBtn = contentEl.createEl("button", {
      cls: "dashboard-banner-save-btn",
      text: t("banner.save"),
    });
    saveBtn.addEventListener("click", () => {
      // Build the partial update carefully:
      // - Always include `image` (the user might or might not have
      //   changed it, but it must be a string value).
      // - Only include `images` when there is at least one rotation
      //   image. Setting `images: undefined` via Object.assign or
      //   spread would WIPE OUT the existing rotation array on the
      //   target banner, even when the user did not intend to
      //   touch the rotation list at all. This is the multi-
      //   attribute update bug: only the fields the user actually
      //   changed should be present in the update payload.
      const updates: Partial<BannerData> = {
        image: this.banner.image,
      };
      if (this.localImages.length > 0) {
        updates.images = this.localImages;
      }
      this.onSave(updates);
      this.close();
    });
  }

  private renderImagesList(container: HTMLElement): void {
    container.empty();
    this.localImages.forEach((img, index) => {
      const row = container.createDiv({ cls: "dashboard-banner-image-row" });

      row.createEl("input", {
        cls: "dashboard-banner-image-input",
        attr: { type: "text", placeholder: t("banner.imagePlaceholder") },
      }).value = img;
      (row.querySelector("input") as HTMLInputElement)?.addEventListener(
        "input",
        (e) => {
          this.localImages[index] = (e.target as HTMLInputElement).value;
        },
      );

      const delBtn = row.createEl("button", {
        cls: "dashboard-banner-remove-btn",
        text: "×",
      });
      delBtn.addEventListener("click", () => {
        this.localImages.splice(index, 1);
        this.renderImagesList(container);
      });
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
