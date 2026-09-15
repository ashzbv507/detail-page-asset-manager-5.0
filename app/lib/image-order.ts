export type DropPosition = "before" | "after";

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
