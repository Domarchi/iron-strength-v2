import { mobileStudentReplyApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mobileStudentReplyApi().post(request, (await params).id);
}
