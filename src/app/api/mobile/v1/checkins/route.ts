import { mobileCheckinApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return mobileCheckinApi().read(request);
}
export async function POST(request: Request) {
  return mobileCheckinApi().save(request);
}
