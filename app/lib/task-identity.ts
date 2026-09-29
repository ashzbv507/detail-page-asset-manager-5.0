type TaskIdentity = {
  brand_key: string;
  product_name: string;
  item_name: string;
  option_name: string;
  vendors: string[];
  note: string;
};

const VENDOR_ORDER = ["컬리 ONLY", "오집 ONLY", "퀸잇 ONLY", "현대 ONLY", "네이버 ONLY", "29cm ONLY"] as const;
const vendorRank = new Map<string, number>(VENDOR_ORDER.map((vendor, index) => [vendor, index]));

export const TASK_CONFLICT_COLUMNS = "brand_key,product_name,item_name,option_name,vendors,note";

export function normalizeTaskVendors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((vendor): vendor is string => typeof vendor === "string").map((vendor) => vendor.trim()).filter(Boolean))]
    .sort((left, right) => (vendorRank.get(left) ?? 100) - (vendorRank.get(right) ?? 100) || left.localeCompare(right, "ko-KR"));
}

function postgresArrayLiteral(values: string[]) {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export function taskDuplicatePath(row: TaskIdentity) {
  const params = new URLSearchParams({ select: "id", limit: "1" });
  for (const field of ["brand_key", "product_name", "item_name", "option_name"] as const) {
    // Top-level eq filters treat the entire decoded value as text, including
    // quotes. URLSearchParams safely encodes free-form text without adding
    // quotes (which would become part of the value being compared).
    params.set(field, `eq.${row[field]}`);
  }
  params.set("vendors", `eq.${postgresArrayLiteral(normalizeTaskVendors(row.vendors))}`);
  if (row.note) params.set("note", `eq.${row.note}`);
  else params.set("or", '(note.eq."",note.is.null)');
  return `asset_tasks?${params.toString()}`;
}
