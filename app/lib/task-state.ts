type Group<T> = { product: string; count: number; items?: T[] };

/** Replace using the persisted ID, including product renames, without resetting UI state. */
export function mergeSavedTask<T extends { id?: string }>(
  groups: Group<T>[], saved: T, groupName: string, sortItems: (items: T[]) => T[],
): Group<T>[] {
  let inserted = false;
  const next = groups.flatMap((group) => {
    const items = (group.items ?? []).filter((item) => item.id !== saved.id);
    if (group.product === groupName) {
      inserted = true;
      const updated = sortItems([...items, saved]);
      return [{ ...group, items: updated, count: updated.length }];
    }
    if (items.length === (group.items?.length ?? 0)) return [group];
    return items.length ? [{ ...group, items, count: items.length }] : [];
  });
  if (!inserted) next.push({ product: groupName, items: [saved], count: 1 });
  return next.sort((left, right) => left.product.localeCompare(right.product, "ko-KR"));
}
