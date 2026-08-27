import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BRAND_IMAGE_FILENAME = "amante_brand_image.jpg";
const apply = process.argv.includes("--apply");

function readEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    const [, key, rawValue] = match;
    return [[key, rawValue.replace(/^['"]|['"]$/g, "")]];
  }));
}

function removeBrandImageHtml(html) {
  return html.replace(/<img\s+[^>]*src=(['"])[^'"]*amante_brand_image\.jpg[^'"]*\1[^>]*>\s*/gi, "").trim();
}

const env = readEnv(await readFile(resolve(".env.local"), "utf8"));
const url = env.SUPABASE_URL?.replace(/\/$/, "");
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");

const headers = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const response = await fetch(`${url}/rest/v1/asset_tasks?select=id,brand_key,product_name,item_name,image_urls,detail_html&brand_key=neq.amante`, { headers });
if (!response.ok) throw new Error(`비아망떼 데이터 조회 실패 (${response.status})`);

const targets = (await response.json()).flatMap((row) => {
  const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : [];
  const cleanImageUrls = imageUrls.filter((value) => !String(value).toLowerCase().includes(BRAND_IMAGE_FILENAME));
  const cleanDetailHtml = removeBrandImageHtml(String(row.detail_html ?? ""));
  if (cleanImageUrls.length === imageUrls.length && cleanDetailHtml === String(row.detail_html ?? "")) return [];
  return [{ ...row, cleanImageUrls, cleanDetailHtml }];
});

console.table(targets.map(({ id, brand_key, product_name, item_name }) => ({ id, brand: brand_key, product: product_name, item: item_name })));
console.log(`${targets.length}개 비아망떼 작업에서 아망떼 브랜드 이미지를 ${apply ? "제거합니다" : "찾았습니다"}.`);

if (apply) {
  for (const task of targets) {
    const update = await fetch(`${url}/rest/v1/asset_tasks?id=eq.${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ image_urls: task.cleanImageUrls, detail_html: task.cleanDetailHtml }),
    });
    if (!update.ok) throw new Error(`${task.product_name} / ${task.item_name} 수정 실패 (${update.status})`);
  }
  console.log("정리 완료");
}
