import { mobileApi } from "@/lib/mobile/production";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return mobileApi().history(request);
}
export async function POST(request: Request) {
  const response = await mobileApi().save(request);
  if (response.ok) {
    revalidatePath("/week");
    revalidatePath("/history");
    revalidatePath("/progress");
    revalidatePath("/coach");
  }
  return response;
}
