import { buildImageUrl, generateKurlyHtml } from "../../lib/html";
import { decodeStoredImageUrl, encodeStoredImageUrl } from "../../lib/image-target";
import type { BrandKey, ImageHtmlTarget } from "../../lib/task-types";

type ImagePayload = { id?: string; name?: string; url?: string; mimeType?: string; size?: number; htmlTarget?: ImageHtmlTarget; excludeFromKurly?: boolean };

type TaskPayload = {
  id?: string;
  brandKey?: string;
  productName?: string;
  itemName?: string;
  optionName?: string;
  storeLink?: string;
  images?: ImagePayload[];
  imageUrls?: string[];
  detailHtml?: string;
  kurlyEnabled?: boolean;
  thumbnailNas?: string;
  detailNas?: string;
  shootingNas?: string;
  vendors?: string[];
  note?: string;
};

type DatabaseRow = {
  id: string;
  brand_key: string;
  product_name: string;
  item_name: string;
  option_name: string;
  store_link: string;
  image_urls: string[];
  detail_html: string;
  kurly_enabled?: boolean;
  thumbnail_nas: string;
  detail_nas: string;
  shooting_nas: string;
  vendors: string[];
  note: string;
};

const BRAND_KEYS = ["amante", "imbedding", "serendiment", "sommier"] as const;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []; }
function brand(value: unknown) { const key = text(value); return BRAND_KEYS.includes(key as typeof BRAND_KEYS[number]) ? key : "amante"; }

function filenameFrom(value: string) {
  const filename = value.split("/").pop()?.split(/[?#]/)[0] ?? "";
  try { return decodeURIComponent(filename); } catch { return filename; }
}

function storedImageUrl(image: ImagePayload, brandKey: BrandKey) {
  const filename = text(image.name) || filenameFrom(text(image.url));
  return filename ? encodeStoredImageUrl(buildImageUrl(filename, brandKey), image) : "";
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return { url, secret };
}
async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, secret } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    if ((details?.code === "PGRST204" || details?.code === "42703") && details.message?.includes("kurly_enabled")) {
      // Keep ordinary saves working until the additive migration is applied.
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      const rows = Array.isArray(body) ? body : body ? [body] : [];
      if (rows.length && rows.every((row) => row.kurly_enabled === true)) {
        const legacyRows = rows.map(({ kurly_enabled: _enabled, ...row }) => row);
        return supabaseRequest(path, { ...init, body: JSON.stringify(Array.isArray(body) ? legacyRows : legacyRows[0]) });
      }
      throw new Error("컬리 생성 설정을 저장하려면 Supabase에서 docs/supabase-kurly-enabled.sql을 먼저 실행해 주세요.");
    }
    throw new Error(`Supabase 요청 실패 (${response.status})`);
  }
  return response;
}
function toRow(payload: TaskPayload): DatabaseRow {
  const productName = text(payload.productName); const itemName = text(payload.itemName);
  if (!productName || !itemName) throw new Error("제품명과 품목은 필수입니다.");
  const brandKey = brand(payload.brandKey) as BrandKey;
  const images = Array.isArray(payload.images) ? payload.images.map((image) => storedImageUrl(image, brandKey)).filter(Boolean) : list(payload.imageUrls);
  return { id: text(payload.id) || crypto.randomUUID(), brand_key: brandKey, product_name: productName, item_name: itemName, option_name: text(payload.optionName), store_link: text(payload.storeLink), image_urls: images, detail_html: text(payload.detailHtml), thumbnail_nas: text(payload.thumbnailNas), detail_nas: text(payload.detailNas), shooting_nas: text(payload.shootingNas), kurly_enabled: payload.kurlyEnabled !== false, vendors: list(payload.vendors), note: text(payload.note) };
}
function toClient(row: DatabaseRow) {
  const images = (row.image_urls ?? []).map((storedUrl, index) => {
    const decoded = decodeStoredImageUrl(storedUrl);
    return { id: `${row.id}-image-${index}-${Buffer.from(storedUrl).toString("base64url").slice(0, 10)}`, name: filenameFrom(decoded.url) || `image-${index + 1}`, ...decoded };
  });
  return { id: row.id, brandKey: brand(row.brand_key), productName: row.product_name, itemName: row.item_name, optionName: row.option_name ?? "", storeLink: row.store_link ?? "", images, vendors: row.vendors ?? [], note: row.note ?? "", thumbnailNas: row.thumbnail_nas ?? "", detailNas: row.detail_nas ?? "", shootingNas: row.shooting_nas ?? "", detailHtml: row.detail_html ?? "", kurlyEnabled: row.kurly_enabled !== false, kurlyHtml: generateKurlyHtml(images, brand(row.brand_key) as BrandKey, row.kurly_enabled !== false) };
}
function failure(error: unknown) { const message = error instanceof Error ? error.message : "Supabase 연결 중 오류가 발생했습니다."; return Response.json({ error: message }, { status: message.includes("환경 변수") ? 503 : message.includes("필수") ? 400 : 502 }); }

export async function GET(request: Request) {
  try {
    const brandKey = text(new URL(request.url).searchParams.get("brandKey"));
    const filter = brandKey ? `&brand_key=eq.${encodeURIComponent(brandKey)}` : "";
    const response = await supabaseRequest(`asset_tasks?select=*&order=created_at.asc${filter}`);
    return Response.json({ tasks: (await response.json() as DatabaseRow[]).map(toClient) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { task?: TaskPayload; tasks?: TaskPayload[]; overwrite?: boolean };
    const payload = body.tasks ?? (body.task ? [body.task] : []);
    if (!payload.length) return Response.json({ error: "저장할 작업 데이터가 없습니다." }, { status: 400 });
    const rows = payload.map(toRow);
    if (body.task) {
      const row = rows[0];
      const duplicateResponse = await supabaseRequest(`asset_tasks?select=id&brand_key=eq.${encodeURIComponent(row.brand_key)}&product_name=eq.${encodeURIComponent(row.product_name)}&item_name=eq.${encodeURIComponent(row.item_name)}&option_name=eq.${encodeURIComponent(row.option_name)}&limit=1`);
      const duplicate = (await duplicateResponse.json() as Array<{ id: string }>)[0];
      if (duplicate && !body.overwrite) return Response.json({ error: "동일한 작업이 이미 있습니다.", code: "DUPLICATE_TASK" }, { status: 409 });
      if (duplicate) rows[0] = { ...row, id: duplicate.id };
    }
    const response = await supabaseRequest(`asset_tasks?on_conflict=brand_key,product_name,item_name,option_name`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
    return Response.json({ tasks: (await response.json() as DatabaseRow[]).map(toClient) });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const id = text(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "수정할 작업 ID가 없습니다." }, { status: 400 });
    const body = await request.json() as TaskPayload | { task?: TaskPayload };
    const payload = ("task" in body && body.task ? body.task : body) as TaskPayload;
    const row = toRow(payload);
    const response = await supabaseRequest(`asset_tasks?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, id }) });
    return Response.json({ tasks: (await response.json() as DatabaseRow[]).map(toClient) });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const id = text(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "삭제할 작업 ID가 없습니다." }, { status: 400 });
    await supabaseRequest(`asset_tasks?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return Response.json({ id });
  } catch (error) { return failure(error); }
}
