export type DropPosition = "before" | "after";

type SortRect = { id: string; top: number; height: number };

// Use the original (untransformed) card centres. Animated cards must not
// become moving hit targets, otherwise the insertion position can oscillate.
export function imageSortTarget(items: string[], activeId: string, pointerY: number, rects: SortRect[]) {
  if (!Number.isFinite(pointerY) || !items.includes(activeId)) return null;
  const others = items.filter((id) => id !== activeId);
  const measured = new Map(rects.map((rect) => [rect.id, rect]));
  if (others.some((id) => !measured.has(id))) return null;
  const index = others.filter((id) => {
    const rect = measured.get(id)!;
    return pointerY >= rect.top + rect.height / 2;
  }).length;
  return items[index] ?? null;
}

export function reorderByTarget<T extends { id: string }>(items: T[], fromId: string, toId: string | null) {
  if (toId === null) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0) return items;
  return reorderByDrop(items, fromId, toId, fromIndex < toIndex ? "after" : "before");
}

export function reorderByDrop<T extends { id: string }>(items: T[], fromId: string, toId: string, position: DropPosition) {
  if (fromId === toId) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  if (fromIndex < 0 || !items.some((item) => item.id === toId)) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  const targetIndex = next.findIndex((item) => item.id === toId);
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);

  return next.every((item, index) => item.id === items[index].id) ? items : next;
}
