import { App, Modal, Setting } from "obsidian";
import type { BannerData, QuoteItem } from "./types";
import { t } from "./i18n";

/**
 * Resolve an image path to a usable resource URL.
 * Supports:
 * - HTTP/HTTPS URLs (used directly)
 * - Vault-relative paths (resolved via Obsidian API)
 */
export function resolveVaultImage(app: App, path: string): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  try {
    const file = app.vault.getAbstractFileByPath(path);
    if (file && "stat" in file) {
      return app.vault.getResourcePath(file as never);
    }
  } catch {
    // ignore
  }
  return null;
}

/* --- Rotation ---------------------------------------------------- */

/** 1 hour for quotes, 30 min for images. The user's promise. */
const QUOTE_ROTATION_MS = 60 * 60 * 1000;
const IMAGE_ROTATION_MS = 30 * 60 * 1000;

/**
 * Per-path rotation index so reloading the dashboard doesn't reset
 * back to the first quote / image mid-session. The key is namespaced
 * by the dashboard file's path so two dashboards in the same vault
 * don't share rotation state.
 */
type RotationState = { quoteIndex: number; imageIndex: number };
function rotationKey(scope: string): string {
  return `apex-dashboard:banner-rotation:${scope}`;
}
function readRotation(scope: string): RotationState {
  try {
    const raw = localStorage.getItem(rotationKey(scope));
    if (!raw) return { quoteIndex: 0, imageIndex: 0 };
    const parsed = JSON.parse(raw);
    return {
      quoteIndex: Math.max(0, Number(parsed?.quoteIndex) || 0),
      imageIndex: Math.max(0, Number(parsed?.imageIndex) || 0),
    };
  } catch {
    return { quoteIndex: 0, imageIndex: 0 };
  }
}
function writeRotation(scope: string, state: RotationState): void {
  try {
    localStorage.setItem(rotationKey(scope), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/* --- Render ------------------------------------------------------ */

/** Returned by renderBanner so the caller can clean up timers. */
export interface BannerHandle {
  bannerEl: HTMLElement;
  dispose: () => void;
}

const PIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
const EDIT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

/**
 * Pick which quote / image to show now.
 *  - If `quotes` has length > 0, rotate through it; otherwise fall
 *    back to the single `quote` field so legacy / hand-edited files
 *    still render their banner content.
 *  - Same rule for `images` vs `image`.
 *  - The "now" index is decided by wall-clock arithmetic so the
 *    quote and image change at deterministic moments across
 *    reloads, not just across rotations.
 */
function nowQuote(banner: BannerData, state: RotationState): QuoteItem | null {
  const pool: QuoteItem[] =
    banner.quotes && banner.quotes.length > 0
      ? banner.quotes
      : banner.quote
        ? [{ quote: banner.quote, author: banner.author ?? "" }]
        : [];
  if (pool.length === 0) return null;
  return pool[state.quoteIndex % pool.length];
}

function nowImage(banner: BannerData, state: RotationState): string {
  const pool: string[] =
    banner.images && banner.images.length > 0
      ? banner.images
      : banner.image
        ? [banner.image]
        : [];
  if (pool.length === 0) return "";
  return pool[state.imageIndex % pool.length];
}

const COLLAPSE_KEY = "apex-dashboard:banner-collapsed";

/**
 * Render the dashboard banner.
 *
 * Layout (top → bottom):
 *   .dashboard-banner
 *     .dashboard-banner-overlay
 *       .dashboard-banner-content
 *         .dashboard-banner-quote
 *         .dashboard-banner-author
 *       .dashboard-banner-edit-btn  (visible on hover, opens onEdit)
 *       .dashboard-banner-pin-btn   (visible on hover, collapses banner)
 *
 * Behaviors:
 *   - background image rotates every 30 min across `images` (falls
 *     back to `image`); the rotation index is persisted so reloads
 *     don't snap back to the first image.
 *   - quote + author rotate every 60 min across `quotes` (falls
 *     back to `quote` + `author`); the rotation index is persisted.
 *   - double-click on the banner opens the edit modal.
 *   - the pin (bookmark) button collapses the banner to a thin
 *     4-px tab on the right, restoring the previous height when
 *     clicked again. State is persisted in localStorage.
 */
export function renderBanner(
  container: HTMLElement,
  banner: BannerData,
  onEdit: () => void,
  app: App,
  scope: string = "default",
): BannerHandle {
  const bannerEl = container.createDiv({ cls: "dashboard-banner" });

  // Restore collapsed state from previous session.
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    // ignore
  }
  if (collapsed) bannerEl.addClass("dashboard-banner--collapsed");

  // --- Pin / collapse button (bookmark) ---
  const pinBtn = bannerEl.createEl("button", {
    cls: "dashboard-banner-pin-btn",
    attr: { type: "button", "aria-label": t("banner.editLabel") },
  });
  pinBtn.innerHTML = PIN_ICON_SVG;
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    bannerEl.toggleClass("dashboard-banner--collapsed", collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  });

  // --- Overlay (holds content + edit button) ---
  const overlay = bannerEl.createDiv({ cls: "dashboard-banner-overlay" });
  const content = overlay.createDiv({ cls: "dashboard-banner-content" });
  const quoteEl = content.createDiv({ cls: "dashboard-banner-quote" });
  const authorEl = content.createDiv({ cls: "dashboard-banner-author" });

  // --- Edit button (small pencil, top-right) ---
  const editBtn = overlay.createEl("button", {
    cls: "dashboard-banner-edit-btn",
    attr: { type: "button", "aria-label": t("banner.editLabel") },
  });
  editBtn.innerHTML = EDIT_ICON_SVG;
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onEdit();
  });

  // --- Double-click banner to edit (desktop convenience) ---
  bannerEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (collapsed) return;
    onEdit();
  });

  // --- Rotation state ---
  let rotation = readRotation(scope);
  let quoteTimer: number | null = null;
  let imageTimer: number | null = null;

  function applyBackground(): void {
    const img = nowImage(banner, rotation);
    const resolved = img ? resolveVaultImage(app, img) : null;
    bannerEl.style.backgroundImage = resolved ? `url("${resolved}")` : "";
  }

  function applyQuote(): void {
    const q = nowQuote(banner, rotation);
    if (!q) {
      quoteEl.setText("");
      authorEl.setText("");
      return;
    }
    quoteEl.setText(q.quote);
    authorEl.setText(q.author ?? "");
    if (banner.quoteColor) {
      quoteEl.style.color = banner.quoteColor;
    } else {
      quoteEl.style.removeProperty("color");
    }
  }

  function advanceQuote(): void {
    if (banner.quotes && banner.quotes.length > 1) {
      quoteEl.addClass("dashboard-banner-quote--fading");
      authorEl.addClass("dashboard-banner-author--fading");
      window.setTimeout(() => {
        rotation.quoteIndex = (rotation.quoteIndex + 1) % banner.quotes!.length;
        writeRotation(scope, rotation);
        applyQuote();
        quoteEl.removeClass("dashboard-banner-quote--fading");
        authorEl.removeClass("dashboard-banner-author--fading");
      }, 400);
    }
  }

  function advanceImage(): void {
    if (banner.images && banner.images.length > 1) {
      bannerEl.addClass("dashboard-banner--fading");
      window.setTimeout(() => {
        rotation.imageIndex =
          (rotation.imageIndex + 1) % banner.images!.length;
        writeRotation(scope, rotation);
        applyBackground();
        bannerEl.removeClass("dashboard-banner--fading");
      }, 600);
    }
  }

  // Initial paint.
  applyBackground();
  applyQuote();

  // Schedule rotations only when there's actually something to
  // rotate through — single-image / single-quote banners are static.
  if (banner.quotes && banner.quotes.length > 1) {
    quoteTimer = window.setInterval(advanceQuote, QUOTE_ROTATION_MS);
  }
  if (banner.images && banner.images.length > 1) {
    imageTimer = window.setInterval(advanceImage, IMAGE_ROTATION_MS);
  }

  return {
    bannerEl,
    dispose: () => {
      if (quoteTimer !== null) window.clearInterval(quoteTimer);
      if (imageTimer !== null) window.clearInterval(imageTimer);
      bannerEl.remove();
    },
  };
}

/* --- Edit Modal -------------------------------------------------- */

/**
 * Modal for editing the banner.
 *
 * Fields:
 *   - image         : primary background image
 *   - quote         : primary quote (shown when `quotes` is empty)
 *   - author        : author of the primary quote
 *   - quoteColor    : CSS color for the quote text (empty = theme default)
 *   - quotes[]      : rotation pool of quotes
 *   - images[]      : rotation pool of background images
 *
 * Single-image mode and rotation mode coexist: a user who has only
 * `image` set will see no rotation; adding any `images[]` entry
 * switches the renderer into rotation mode.
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
    this.banner = {
      ...banner,
      quotes: banner.quotes ? [...banner.quotes] : undefined,
      images: banner.images ? [...banner.images] : undefined,
    };
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dashboard-banner-edit-modal");

    contentEl.createEl("h2", { text: t("banner.editTitle") });

    // --- Primary image ---
    new Setting(contentEl)
      .setName(t("banner.image"))
      .setDesc(t("banner.imageDesc"))
      .addText((text) => {
        text
          .setValue(this.banner.image || "")
          .setPlaceholder(t("banner.imagePlaceholder"))
          .onChange((val) => (this.banner.image = val));
      });

    // --- Primary quote + author ---
    new Setting(contentEl)
      .setName(t("banner.quote"))
      .addText((text) => {
        text
          .setValue(this.banner.quote || "")
          .setPlaceholder(t("banner.quote"))
          .onChange((val) => (this.banner.quote = val));
      });
    new Setting(contentEl)
      .setName(t("banner.author"))
      .addText((text) => {
        text
          .setValue(this.banner.author || "")
          .setPlaceholder(t("banner.author"))
          .onChange((val) => (this.banner.author = val));
      });

    // --- Quote color picker ---
    new Setting(contentEl)
      .setName(t("banner.quoteColor"))
      .addColorPicker((picker) => {
        picker.setValue(this.banner.quoteColor || "").onChange((val) => {
          this.banner.quoteColor = val || undefined;
        });
      })
      .addButton((btn) => {
        btn.setButtonText(t("banner.resetColor")).onClick(() => {
          this.banner.quoteColor = undefined;
          this.onOpen();
        });
      });

    // --- Quotes collection (rotation pool) ---
    const quotesHeader = contentEl.createDiv({
      cls: "dashboard-banner-edit-section",
    });
    quotesHeader.createEl("h3", { text: t("banner.quotesLabel") });
    const quotesList = contentEl.createDiv({
      cls: "dashboard-banner-edit-list",
    });
    const renderQuotes = (): void => {
      quotesList.empty();
      const quotes = this.banner.quotes ?? [];
      quotes.forEach((q, idx) => {
        const row = quotesList.createDiv({
          cls: "dashboard-banner-edit-row",
        });
        const text = row.createEl("input", {
          attr: { type: "text", placeholder: t("banner.quote") },
        });
        text.value = q.quote ?? "";
        text.addEventListener("input", () => {
          this.banner.quotes![idx] = {
            quote: text.value,
            author: this.banner.quotes![idx]?.author ?? "",
          };
        });
        const author = row.createEl("input", {
          attr: { type: "text", placeholder: t("banner.author") },
        });
        author.value = q.author ?? "";
        author.addEventListener("input", () => {
          this.banner.quotes![idx] = {
            quote: this.banner.quotes![idx]?.quote ?? "",
            author: author.value,
          };
        });
        const del = row.createEl("button", {
          text: t("banner.deleteQuote"),
        });
        del.addEventListener("click", () => {
          this.banner.quotes!.splice(idx, 1);
          if (this.banner.quotes!.length === 0) {
            this.banner.quotes = undefined;
          }
          renderQuotes();
        });
      });
    };
    renderQuotes();
    const addQuoteBtn = contentEl.createEl("button", {
      text: t("banner.addQuote"),
    });
    addQuoteBtn.addEventListener("click", () => {
      if (!this.banner.quotes) this.banner.quotes = [];
      this.banner.quotes.push({ quote: "", author: "" });
      renderQuotes();
    });

    // --- Rotation images (background pool) ---
    const imagesHeader = contentEl.createDiv({
      cls: "dashboard-banner-edit-section",
    });
    imagesHeader.createEl("h3", { text: t("banner.rotationImages") });
    const imagesList = contentEl.createDiv({
      cls: "dashboard-banner-edit-list",
    });
    const renderImages = (): void => {
      imagesList.empty();
      const images = this.banner.images ?? [];
      images.forEach((img, idx) => {
        const row = imagesList.createDiv({
          cls: "dashboard-banner-edit-row",
        });
        const text = row.createEl("input", {
          attr: { type: "text", placeholder: t("banner.imagePlaceholder") },
        });
        text.value = img;
        text.addEventListener("input", () => {
          this.banner.images![idx] = text.value;
        });
        const del = row.createEl("button", {
          text: t("banner.deleteImage"),
        });
        del.addEventListener("click", () => {
          this.banner.images!.splice(idx, 1);
          if (this.banner.images!.length === 0) {
            this.banner.images = undefined;
          }
          renderImages();
        });
      });
    };
    renderImages();
    const addImageBtn = contentEl.createEl("button", {
      text: t("banner.addImage"),
    });
    addImageBtn.addEventListener("click", () => {
      if (!this.banner.images) this.banner.images = [];
      this.banner.images.push("");
      renderImages();
    });

    // --- Save / Cancel ---
    const actions = contentEl.createDiv({ cls: "dashboard-banner-edit-actions" });
    const cancelBtn = actions.createEl("button", { text: t("common.cancel") });
    cancelBtn.addEventListener("click", () => this.close());
    const saveBtn = actions.createEl("button", {
      cls: "dashboard-banner-save-btn",
      text: t("banner.save"),
    });
    saveBtn.addEventListener("click", () => {
      this.onSave({
        image: this.banner.image ?? "",
        quote: this.banner.quote ?? "",
        author: this.banner.author ?? "",
        quoteColor: this.banner.quoteColor,
        quotes: this.banner.quotes && this.banner.quotes.length > 0
          ? this.banner.quotes.filter((q) => q.quote.trim().length > 0)
          : undefined,
        images: this.banner.images && this.banner.images.length > 0
          ? this.banner.images.filter((s) => s.trim().length > 0)
          : undefined,
      });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
