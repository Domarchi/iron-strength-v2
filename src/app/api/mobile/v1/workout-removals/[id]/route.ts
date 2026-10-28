import { mobileWorkoutRemovalApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mobileWorkoutRemovalApi().read(request, (await params).id);
}
