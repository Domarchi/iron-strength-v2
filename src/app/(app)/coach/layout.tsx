import { requireCoach } from "@/lib/auth/session";

// Área exclusiva del coach: a un alumno le responde 404.
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return children;
}
