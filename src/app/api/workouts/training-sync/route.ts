import { webTrainingSync } from "@/lib/workout/web-training-production";
export async function POST(request: Request) {
  return webTrainingSync()(request);
}
