import { withPreviewImageVersion } from "./html";
import type { AssetImage } from "./task-types";
import { PREVIEW_VIEW_STORAGE_KEY } from "./preview-view-state";

export const HTML_PREVIEW_STORAGE_KEY = "detail-page-asset-manager:html-preview";

export type HtmlPreviewMode = "general" | "kurly";
export type HtmlPreviewPayload = {
  mode: HtmlPreviewMode;
  images: Array<Pick<AssetImage, "name" | "url">>;
  version: number;
};

export function createHtmlPreviewPayload(mode: HtmlPreviewMode, images: AssetImage[], version: number): HtmlPreviewPayload {
  return {
    mode,
    images: images.map(({ name, url }) => ({ name, url })),
    version,
  };
}

/** Preview saved HTML in its own order, never the editor's separate image list. */
export function previewImagesFromHtml(html: string): AssetImage[] {
  return [...html.matchAll(/<img\s+src=['"]([^'"]+)['"]/g)].map((match, index) => {
    const url = match[1];
    let name = `image-${index + 1}`;
    try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || name); } catch { /* Keep the fallback name. */ }
    return { id: `html-preview-${index}-${url}`, name, url };
  });
}

export function htmlPreviewFailureMessage(result: HtmlPreviewOpenResult): string | null {
  if (result === "popup-blocked") return "팝업이 차단되었습니다. 팝업을 허용해 주세요.";
  if (result === "storage-unavailable") return "새 창 미리보기 데이터를 준비하지 못했습니다.";
  return null;
}

export function parseHtmlPreviewPayload(value: string | null): HtmlPreviewPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<HtmlPreviewPayload>;
    if (!parsed || (parsed.mode !== "general" && parsed.mode !== "kurly") || !Array.isArray(parsed.images) || typeof parsed.version !== "number" || !Number.isFinite(parsed.version)) return null;
    const images = parsed.images.filter((image): image is Pick<AssetImage, "name" | "url"> => Boolean(image) && typeof image.name === "string" && typeof image.url === "string");
    return { mode: parsed.mode, images, version: parsed.version };
  } catch {
    return null;
  }
}

export function readHtmlPreviewSnapshot(storage: Pick<Storage, "getItem">, now = Date.now()): HtmlPreviewPayload | null {
  try {
    const payload = parseHtmlPreviewPayload(storage.getItem(HTML_PREVIEW_STORAGE_KEY));
    // Reload the same tab's snapshot, but request fresh remote images again.
    return payload ? { ...payload, version: Math.max(payload.version, now) } : null;
  } catch {
    return null;
  }
}

export type HtmlPreviewOpenResult = "opened" | "popup-blocked" | "storage-unavailable";

export function openHtmlPreviewTab(payload: HtmlPreviewPayload): HtmlPreviewOpenResult {
  let previewWindow: Window | null;
  try {
    // Keep this synchronous in the click handler so popup blockers can see
    // the user gesture. _blank always creates a separate browsing context.
    previewWindow = window.open("about:blank", "_blank");
  } catch {
    return "popup-blocked";
  }
  if (!previewWindow) return "popup-blocked";

  try {
    // The initial blank document inherits our origin. Populate its own
    // sessionStorage before navigating; no shared localStorage or live sync.
    previewWindow.sessionStorage.setItem(HTML_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
    previewWindow.sessionStorage.removeItem(PREVIEW_VIEW_STORAGE_KEY);
    previewWindow.opener = null;
    previewWindow.location.replace("/html-preview");
  } catch {
    previewWindow.close();
    return "storage-unavailable";
  }
  // Some embedded browsers cannot focus a tab even after opening it. That
  // must not turn a successful preview into an unhandled click error.
  try { previewWindow.focus(); } catch { /* The tab is already open. */ }
  return "opened";
}

export function previewImageUrl(url: string, version: number) {
  return withPreviewImageVersion(url, version);
}
