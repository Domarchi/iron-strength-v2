import { mobilePersonalApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return mobilePersonalApi().mutate(request);
}
