type Rect = { left: number; right: number; top: number; bottom: number };

export function sharePopoverPosition(anchor: Rect, size: { width: number; height: number }, viewport: { width: number; height: number; left?: number; top?: number }) {
  const margin = 12;
  const gap = 12;
  const viewportLeft = viewport.left ?? 0;
  const viewportTop = viewport.top ?? 0;
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const left = Math.max(viewportLeft + margin, Math.min(anchor.right - width, viewportLeft + viewport.width - width - margin));
  const above = anchor.top - gap - size.height >= viewportTop + margin;
  const top = Math.max(viewportTop + margin, Math.min(above ? anchor.top - gap - size.height : anchor.bottom + gap, viewportTop + viewport.height - size.height - margin));
  const arrowLeft = Math.max(20, Math.min(width - 20, (anchor.left + anchor.right) / 2 - left));
  return { left, top, arrowLeft, side: above ? "above" as const : "below" as const };
}
