import { mobilePersonalWorkoutApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return mobilePersonalWorkoutApi().save(request);
}
