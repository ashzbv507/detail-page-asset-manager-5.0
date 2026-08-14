import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const env = Object.fromEntries((await import("node:fs")).readFileSync(".env.local", "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
const baseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !secret) throw new Error(".env.local에 Supabase 설정이 없습니다.");

const response = await fetch(`${baseUrl}/rest/v1/asset_tasks?select=id,brand_key,product_name,item_name,option_name,store_link,image_urls,detail_html,thumbnail_nas,detail_nas,vendors,note&order=created_at.asc`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}` },
});
if (!response.ok) throw new Error(`Supabase 조회 실패: ${response.status}`);
const rows = await response.json();
const tasks = rows.map((row) => {
  const images = (row.image_urls ?? []).map((url, index) => ({ id: `${row.id}-image-${index}-${Buffer.from(url).toString("base64url").slice(0, 10)}`, name: url.split("/").pop() || `image-${index + 1}`, url }));
  return { id: row.id, brandKey: row.brand_key, productName: row.product_name, itemName: row.item_name, optionName: row.option_name ?? "", storeLink: row.store_link ?? "", images, vendors: row.vendors ?? [], note: row.note ?? "", thumbnailNas: row.thumbnail_nas ?? "", detailNas: row.detail_nas ?? "", detailHtml: row.detail_html ?? "" };
});

const output = resolve("public/data/tasks.json");
await mkdir(resolve("public/data"), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), tasks }, null, 2)}\n`, "utf8");
console.log(`Exported ${tasks.length} Supabase tasks to ${output}`);
