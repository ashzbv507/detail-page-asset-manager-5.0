type SearchableTask = {
  product: string;
  item: string;
  option?: string;
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

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_INITIALS = ["ᄀ", "ᄁ", "ᄂ", "ᄃ", "ᄄ", "ᄅ", "ᄆ", "ᄇ", "ᄈ", "ᄉ", "ᄊ", "ᄋ", "ᄌ", "ᄍ", "ᄎ", "ᄏ", "ᄐ", "ᄑ", "ᄒ"] as const;
const HANGUL_INITIAL_SET = new Set<string>(HANGUL_INITIALS);

function getHangulInitials(value: string) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0);
    if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) return character;
    return HANGUL_INITIALS[Math.floor((code - HANGUL_SYLLABLE_START) / 588)];
  }).join("");
}

export function matchesSearchText(value: string, query: string, ignoreWhitespace = false) {
  let needle = normalizeSearch(query);
  let haystack = normalizeSearch(value);
  if (ignoreWhitespace) {
    needle = needle.replace(/\s/g, "");
    haystack = haystack.replace(/\s/g, "");
  }
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  if (![...needle].some((character) => HANGUL_INITIAL_SET.has(character))) return false;
  return getHangulInitials(haystack).includes(getHangulInitials(needle));
}

export function matchesTaskSearch(task: SearchableTask, query: string, groupName = "") {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const values = [groupName, task.product, task.item, task.option, task.html, task.storeLink,
    task.thumbnailNas, task.detailNas, task.shootingNas,
    ...(task.images ?? []).flatMap((image) => [image.name, image.url])];
  return values.some((value) => {
    if (!value) return false;
    if (matchesSearchText(value, needle)) return true;
    try { return matchesSearchText(decodeURIComponent(value), needle); }
    catch { return false; }
  });
}
