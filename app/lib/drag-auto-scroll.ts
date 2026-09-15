export const DRAG_SCROLL_EDGE_SIZE = 56;
export const DRAG_SCROLL_HORIZONTAL_TOLERANCE = 40;
export const DRAG_SCROLL_VERTICAL_TOLERANCE = 24;
export const DRAG_SCROLL_MAX_SPEED = 840;
export const DRAG_SCROLL_MIN_SPEED = 120;

export function dragAutoScrollVelocity(pointerY: number, top: number, bottom: number, edgeSize = DRAG_SCROLL_EDGE_SIZE, maxSpeed = DRAG_SCROLL_MAX_SPEED) {
  if (bottom <= top || edgeSize <= 0 || maxSpeed <= 0) return 0;

  const clampedY = Math.min(bottom, Math.max(top, pointerY));
  if (clampedY < top + edgeSize) {
    const intensity = Math.min(1, (top + edgeSize - clampedY) / edgeSize);
    return -Math.max(DRAG_SCROLL_MIN_SPEED, maxSpeed * intensity);
  }
  if (clampedY > bottom - edgeSize) {
    const intensity = Math.min(1, (clampedY - (bottom - edgeSize)) / edgeSize);
    return Math.max(DRAG_SCROLL_MIN_SPEED, maxSpeed * intensity);
  }
  return 0;
}
