type SearchableTask = {
  product: string;
  item: string;
  html: string;
  storeLink?: string;
  thumbnailNas: string;
  detailNas: string;
  shootingNas: string;
  images?: Array<{ name: string; url: string }>;
};

export function normalizeSearch(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchesTaskSearch(task: SearchableTask, query: string, groupName = "") {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const values = [groupName, task.product, task.item, task.html, task.storeLink,
    task.thumbnailNas, task.detailNas, task.shootingNas,
    ...(task.images ?? []).flatMap((image) => [image.name, image.url])];
  return values.some((value) => {
    if (!value) return false;
    if (normalizeSearch(value).includes(needle)) return true;
    try { return normalizeSearch(decodeURIComponent(value)).includes(needle); }
    catch { return false; }
  });
}
