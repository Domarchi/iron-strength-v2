import { mobileTrainingLibraryApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return mobileTrainingLibraryApi().mutate(request);
}
