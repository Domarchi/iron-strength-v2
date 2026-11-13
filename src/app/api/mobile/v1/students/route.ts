import { mobileStudentsApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return mobileStudentsApi().read(request);
}
