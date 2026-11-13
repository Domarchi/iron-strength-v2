import { mobileMeasurementsApi } from "@/lib/mobile/production";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return mobileMeasurementsApi().list(request);
}
export async function POST(request: Request) {
  return mobileMeasurementsApi().save(request);
}
