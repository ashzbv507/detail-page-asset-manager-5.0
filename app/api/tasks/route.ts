import { buildImageUrl } from "../../lib/html";

type ImagePayload = { id?: string; name?: string; url?: string; mimeType?: string; size?: number; excludeFromKurly?: boolean };

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
  thumbnailNas?: string;
  detailNas?: string;
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
  thumbnail_nas: string;
  detail_nas: string;
  vendors: string[];
  note: string;
};

const BRAND_KEYS = ["amante", "imbedding", "serendiment", "sommier"] as const;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []; }
function brand(value: unknown) { const key = text(value); return BRAND_KEYS.includes(key as typeof BRAND_KEYS[number]) ? key : "amante"; }
const KURLY_EXCLUDE_MARKER = "#kurly-excluded";

function filenameFrom(value: string) {
  const filename = value.split("/").pop()?.split(/[?#]/)[0] ?? "";
  try { return decodeURIComponent(filename); } catch { return filename; }
}

function storedImageUrl(image: ImagePayload) {
  const filename = text(image.name) || filenameFrom(text(image.url));
  return filename ? `${buildImageUrl(filename)}${image.excludeFromKurly ? KURLY_EXCLUDE_MARKER : ""}` : "";
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
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status})`);
  return response;
}
function toRow(payload: TaskPayload): DatabaseRow {
  const productName = text(payload.productName); const itemName = text(payload.itemName);
  if (!productName || !itemName) throw new Error("제품명과 품목은 필수입니다.");
  const images = Array.isArray(payload.images) ? payload.images.map(storedImageUrl).filter(Boolean) : list(payload.imageUrls);
  return { id: text(payload.id) || crypto.randomUUID(), brand_key: brand(payload.brandKey), product_name: productName, item_name: itemName, option_name: text(payload.optionName), store_link: text(payload.storeLink), image_urls: images, detail_html: text(payload.detailHtml), thumbnail_nas: text(payload.thumbnailNas), detail_nas: text(payload.detailNas), vendors: list(payload.vendors), note: text(payload.note) };
}
function toClient(row: DatabaseRow) {
  const images = (row.image_urls ?? []).map((storedUrl, index) => {
    const excludeFromKurly = storedUrl.endsWith(KURLY_EXCLUDE_MARKER);
    const url = excludeFromKurly ? storedUrl.slice(0, -KURLY_EXCLUDE_MARKER.length) : storedUrl;
    return { id: `${row.id}-image-${index}-${Buffer.from(storedUrl).toString("base64url").slice(0, 10)}`, name: filenameFrom(url) || `image-${index + 1}`, url, excludeFromKurly };
  });
  return { id: row.id, brandKey: brand(row.brand_key), productName: row.product_name, itemName: row.item_name, optionName: row.option_name ?? "", storeLink: row.store_link ?? "", images, vendors: row.vendors ?? [], note: row.note ?? "", thumbnailNas: row.thumbnail_nas ?? "", detailNas: row.detail_nas ?? "", detailHtml: row.detail_html ?? "" };
}
function failure(error: unknown) { const message = error instanceof Error ? error.message : "Supabase 연결 중 오류가 발생했습니다."; return Response.json({ error: message }, { status: message.includes("환경 변수") ? 503 : message.includes("필수") ? 400 : 502 }); }

export async function GET(request: Request) {
  try {
    const brandKey = text(new URL(request.url).searchParams.get("brandKey"));
    const filter = brandKey ? `&brand_key=eq.${encodeURIComponent(brandKey)}` : "";
    const response = await supabaseRequest(`asset_tasks?select=id,brand_key,product_name,item_name,option_name,store_link,image_urls,detail_html,thumbnail_nas,detail_nas,vendors,note&order=created_at.asc${filter}`);
    return Response.json({ tasks: (await response.json() as DatabaseRow[]).map(toClient) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { task?: TaskPayload; tasks?: TaskPayload[] };
    const payload = body.tasks ?? (body.task ? [body.task] : []);
    if (!payload.length) return Response.json({ error: "저장할 작업 데이터가 없습니다." }, { status: 400 });
    const response = await supabaseRequest(`asset_tasks?on_conflict=brand_key,product_name,item_name,option_name`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload.map(toRow)) });
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
