import type { HtmlPreviewPayload } from "./html-preview";
import { clampPreviewZoom } from "./preview-zoom";

export const PREVIEW_VIEW_STORAGE_KEY = "detail-page-asset-manager:preview-view";
export type PreviewViewState = { zoom: number; fitToWindow: boolean; scrollLeft: number; scrollTop: number };

function snapshotKey(payload: HtmlPreviewPayload) {
  // Image refresh versions change; the product snapshot must not.
  return JSON.stringify([payload.mode, payload.images]);
}

export function readPreviewView(storage: Pick<Storage, "getItem">, payload: HtmlPreviewPayload): PreviewViewState | null {
  try {
    const stored = JSON.parse(storage.getItem(PREVIEW_VIEW_STORAGE_KEY) ?? "null");
    if (!stored || stored.snapshot !== snapshotKey(payload) || typeof stored.fitToWindow !== "boolean"
      || ![stored.zoom, stored.scrollLeft, stored.scrollTop].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return { zoom: clampPreviewZoom(stored.zoom), fitToWindow: stored.fitToWindow, scrollLeft: Math.max(0, stored.scrollLeft), scrollTop: Math.max(0, stored.scrollTop) };
  } catch { return null; }
}

export function writePreviewView(storage: Pick<Storage, "setItem">, payload: HtmlPreviewPayload, view: PreviewViewState) {
  try { storage.setItem(PREVIEW_VIEW_STORAGE_KEY, JSON.stringify({ snapshot: snapshotKey(payload), ...view })); } catch { /* Preview remains usable when storage is restricted. */ }
}
