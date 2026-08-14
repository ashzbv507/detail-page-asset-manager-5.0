import ShareViewer from "./ShareViewer";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareViewer token={token} />;
}
