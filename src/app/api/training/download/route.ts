import { webTrainingDownload } from "@/lib/workout/web-training-production";
export async function GET(request: Request) {
  return webTrainingDownload()(request);
}
