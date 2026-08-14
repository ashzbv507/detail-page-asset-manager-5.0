import { getShareRecord } from "../route";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await getShareRecord(token);
  if (!share) return Response.json({ error: "공유 링크가 없거나 만료되었습니다." }, { status: 404 });
  return Response.json({ share: { tasks: share.tasks, createdAt: share.createdAt, expiresAt: share.expiresAt } });
}
