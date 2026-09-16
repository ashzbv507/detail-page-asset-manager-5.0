import { withPreviewImageVersion } from "./html";
import type { AssetImage } from "./task-types";

export const HTML_PREVIEW_STORAGE_KEY = "detail-page-asset-manager:html-preview";
export const HTML_PREVIEW_WINDOW_NAME = "detail-page-html-preview";

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

export function parseHtmlPreviewPayload(value: string | null): HtmlPreviewPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<HtmlPreviewPayload>;
    if ((parsed.mode !== "general" && parsed.mode !== "kurly") || !Array.isArray(parsed.images) || typeof parsed.version !== "number") return null;
    const images = parsed.images.filter((image): image is Pick<AssetImage, "name" | "url"> => Boolean(image) && typeof image.name === "string" && typeof image.url === "string");
    return { mode: parsed.mode, images, version: parsed.version };
  } catch {
    return null;
  }
}

export function previewImageUrl(url: string, version: number) {
  return withPreviewImageVersion(url, version);
}
