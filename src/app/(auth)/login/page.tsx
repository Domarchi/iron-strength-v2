import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/layout/login-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Iron Strength" };

const REASONS: Record<string, string> = {
  sesion: "Tu sesión terminó o tu cuenta está desactivada. Entra de nuevo.",
  clave: "Contraseña actualizada. Entra con tu contraseña nueva.",
  "cuenta-borrada": "Tu cuenta y tus datos fueron borrados. Gracias por entrenar con nosotros.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  if (await getCurrentUser()) redirect("/");

  return (
    <LoginPanel message={motivo ? REASONS[motivo] : undefined}>
      <LoginForm />
    </LoginPanel>
  );
}
