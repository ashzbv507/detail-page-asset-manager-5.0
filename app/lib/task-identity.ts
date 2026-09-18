type TaskIdentity = {
  brand_key: string;
  product_name: string;
  item_name: string;
  option_name: string;
  note: string;
};

export const TASK_CONFLICT_COLUMNS = "brand_key,product_name,item_name,option_name,note";

export function taskDuplicatePath(row: TaskIdentity) {
  const params = new URLSearchParams({ select: "id", limit: "1" });
  for (const field of ["brand_key", "product_name", "item_name", "option_name"] as const) {
    // Top-level eq filters treat the entire decoded value as text, including
    // quotes. URLSearchParams safely encodes free-form text without adding
    // quotes (which would become part of the value being compared).
    params.set(field, `eq.${row[field]}`);
  }
  if (row.note) params.set("note", `eq.${row.note}`);
  else params.set("or", '(note.eq."",note.is.null)');
  return `asset_tasks?${params.toString()}`;
}
