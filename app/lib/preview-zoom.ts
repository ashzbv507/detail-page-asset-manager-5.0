export const PREVIEW_BASE_WIDTH = 860;
export const PREVIEW_MIN_ZOOM = 30;
export const PREVIEW_MAX_ZOOM = 150;
export const PREVIEW_ZOOM_STEP = 5;

export function clampPreviewZoom(value: number) {
  return Number.isFinite(value) ? Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, value)) : 100;
}

export function fitPreviewZoom(viewportWidth: number) {
  return clampPreviewZoom(Math.min(100, Math.floor((viewportWidth - 32) / PREVIEW_BASE_WIDTH * 100)));
}

type PreviewRect = { left: number; top: number; width: number };
type ViewportRect = { left: number; top: number; width: number; height: number };
export type PreviewAnchor = { x: number; y: number; viewX: number; viewY: number };

// Store the reading position in width-relative units: the entire image strip
// scales proportionally with its width, regardless of how long the page is.
export function capturePreviewAnchor(canvas: PreviewRect, viewport: ViewportRect): PreviewAnchor | null {
  if (canvas.width <= 0) return null;
  const viewX = viewport.width / 2;
  const viewY = Math.min(120, viewport.height / 3);
  return {
    x: (viewport.left + viewX - canvas.left) / canvas.width,
    y: (viewport.top + viewY - canvas.top) / canvas.width,
    viewX,
    viewY,
  };
}

export function previewAnchorDelta(anchor: PreviewAnchor, canvas: PreviewRect, viewport: ViewportRect) {
  return {
    left: canvas.left + anchor.x * canvas.width - viewport.left - anchor.viewX,
    top: canvas.top + anchor.y * canvas.width - viewport.top - anchor.viewY,
  };
}
