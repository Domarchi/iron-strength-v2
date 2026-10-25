import { mobileCommentsApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return mobileCommentsApi().markRead(request, (await context.params).id);
}
