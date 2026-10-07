import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

// Entrada: cada rol aterriza en su pantalla principal.
export default async function Home() {
  const user = await requireUser();
  redirect(user.role === "coach" ? "/coach/students" : "/week");
}
