import { mobileCommentsApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return mobileCommentsApi().remove(request, (await context.params).id);
}
