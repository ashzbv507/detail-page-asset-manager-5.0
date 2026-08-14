import { createHash, randomBytes } from "node:crypto";

type ShareImage = { id?: string; name?: string; url?: string; mimeType?: string; size?: number; excludeFromKurly?: boolean };
type ShareTask = { id?: string; brandKey?: string; product?: string; item?: string; html?: string; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas?: string; detailNas?: string; images?: ShareImage[] };
type ShareRecord = { tokenHash: string; tasks: ShareTask[]; createdAt: string; expiresAt: string };

const shareStore = (() => {
  const root = globalThis as typeof globalThis & { __assetShareStore?: Map<string, ShareRecord> };
  root.__assetShareStore ??= new Map<string, ShareRecord>();
  return root.__assetShareStore;
})();

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

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tasks?: ShareTask[] };
    const tasks = Array.isArray(body.tasks) ? body.tasks.map(normalizeTask).filter((task): task is ShareTask => Boolean(task)) : [];
    if (!tasks.length) return Response.json({ error: "공유할 행이 없습니다." }, { status: 400 });
    const token = randomBytes(32).toString("base64url");
    const tokenHashValue = tokenHash(token);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 30);
    const record: ShareRecord = { tokenHash: tokenHashValue, tasks, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
    shareStore.set(tokenHashValue, record);
    try {
      await supabaseRequest("asset_shares", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ token_hash: tokenHashValue, snapshot_data: { tasks }, created_at: record.createdAt, expires_at: record.expiresAt }) });
    } catch {
      // The local fallback keeps the feature usable until the asset_shares migration is applied.
    }
    return Response.json({ shareUrl: `/share/${token}`, expiresAt: record.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function getShareRecord(token: string) {
  const hash = tokenHash(token);
  const local = shareStore.get(hash);
  if (local) return local;
  try {
    const response = await supabaseRequest(`asset_shares?select=snapshot_data,created_at,expires_at&token_hash=eq.${encodeURIComponent(hash)}&limit=1`);
    const rows = await response.json() as Array<{ snapshot_data?: { tasks?: ShareTask[] }; created_at?: string; expires_at?: string }>;
    const row = rows[0];
    if (!row?.snapshot_data?.tasks?.length) return null;
    const record: ShareRecord = { tokenHash: hash, tasks: row.snapshot_data.tasks, createdAt: row.created_at ?? "", expiresAt: row.expires_at ?? "" };
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return null;
    return record;
  } catch {
    return null;
  }
}
