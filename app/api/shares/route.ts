import { createHash, randomBytes } from "node:crypto";

type ShareImage = { id?: string; name?: string; url?: string; mimeType?: string; size?: number; excludeFromKurly?: boolean };
type ShareTask = { id?: string; brandKey?: string; product?: string; item?: string; html?: string; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas?: string; detailNas?: string; images?: ShareImage[] };
type ShareRecord = { tokenHash: string; tasks: ShareTask[]; createdAt: string; expiresAt: string };
type DatabaseTask = { id: string; brand_key: string; product_name: string; item_name: string; store_link: string; image_urls: string[]; detail_html: string; thumbnail_nas: string; detail_nas: string; vendors: string[]; note: string };

const KURLY_EXCLUDE_MARKER = "#kurly-excluded";
const PERMANENT_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase is not configured");
  return { url, secret };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, secret } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response;
}

function normalizeTask(task: ShareTask): ShareTask | null {
  if (!task.id || !task.product || !task.item) return null;
  return {
    id: task.id,
    brandKey: task.brandKey,
    product: task.product,
    item: task.item,
    html: task.html ?? "",
    storeLink: task.storeLink ?? "",
    vendors: Array.isArray(task.vendors) ? task.vendors.filter((vendor): vendor is string => typeof vendor === "string") : [],
    note: task.note ?? "",
    thumbnailNas: task.thumbnailNas ?? "",
    detailNas: task.detailNas ?? "",
    images: Array.isArray(task.images) ? task.images.filter((image) => image?.url).map((image) => ({ id: image.id, name: image.name, url: image.url, mimeType: image.mimeType, size: image.size, excludeFromKurly: image.excludeFromKurly })) : [],
  };
}

function filenameFrom(value: string) {
  const filename = value.split("/").pop()?.split(/[?#]/)[0] ?? "";
  try { return decodeURIComponent(filename); } catch { return filename; }
}

function toSharedTask(row: DatabaseTask): ShareTask {
  const images = (row.image_urls ?? []).map((storedUrl, index) => {
    const excludeFromKurly = storedUrl.endsWith(KURLY_EXCLUDE_MARKER);
    const url = excludeFromKurly ? storedUrl.slice(0, -KURLY_EXCLUDE_MARKER.length) : storedUrl;
    return { id: `${row.id}-image-${index}`, name: filenameFrom(url) || `image-${index + 1}`, url, excludeFromKurly };
  });
  return { id: row.id, brandKey: row.brand_key, product: row.product_name, item: row.item_name, html: row.detail_html ?? "", storeLink: row.store_link ?? "", vendors: row.vendors ?? [], note: row.note ?? "", thumbnailNas: row.thumbnail_nas ?? "", detailNas: row.detail_nas ?? "", images };
}

async function getCurrentTasks(taskIds: string[]) {
  const ids = taskIds.filter((id) => /^[a-z0-9-]{36}$/i.test(id));
  if (!ids.length) return [];
  const response = await supabaseRequest(`asset_tasks?select=id,brand_key,product_name,item_name,store_link,image_urls,detail_html,thumbnail_nas,detail_nas,vendors,note&id=in.(${encodeURIComponent(ids.join(","))})&order=created_at.asc`);
  return (await response.json() as DatabaseTask[]).map(toSharedTask);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tasks?: ShareTask[] };
    const tasks = Array.isArray(body.tasks) ? body.tasks.map(normalizeTask).filter((task): task is ShareTask => Boolean(task)) : [];
    if (!tasks.length) return Response.json({ error: "공유할 행이 없습니다." }, { status: 400 });
    const token = randomBytes(32).toString("base64url");
    const tokenHashValue = tokenHash(token);
    const createdAt = new Date();
    const record: ShareRecord = { tokenHash: tokenHashValue, tasks, createdAt: createdAt.toISOString(), expiresAt: PERMANENT_EXPIRES_AT };
    await supabaseRequest("asset_shares", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ token_hash: tokenHashValue, snapshot_data: { taskIds: tasks.map((task) => task.id) }, created_at: record.createdAt, expires_at: record.expiresAt }) });
    return Response.json({ shareUrl: `/share/${token}`, expiresAt: record.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function getShareRecord(token: string) {
  const hash = tokenHash(token);
  try {
    const response = await supabaseRequest(`asset_shares?select=snapshot_data,created_at,expires_at&token_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&limit=1`);
    const rows = await response.json() as Array<{ snapshot_data?: { tasks?: ShareTask[]; taskIds?: string[] }; created_at?: string; expires_at?: string }>;
    const row = rows[0];
    if (!row?.snapshot_data) return null;
    const taskIds = Array.isArray(row.snapshot_data.taskIds) ? row.snapshot_data.taskIds.filter((id): id is string => typeof id === "string") : [];
    const tasks = taskIds.length ? await getCurrentTasks(taskIds) : (row.snapshot_data.tasks ?? []);
    const record: ShareRecord = { tokenHash: hash, tasks, createdAt: row.created_at ?? "", expiresAt: row.expires_at ?? "" };
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return null;
    return record;
  } catch {
    return null;
  }
}
