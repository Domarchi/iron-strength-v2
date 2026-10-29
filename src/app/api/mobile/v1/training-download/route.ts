import { mobileTrainingDownloadApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return mobileTrainingDownloadApi().read(request);
}
