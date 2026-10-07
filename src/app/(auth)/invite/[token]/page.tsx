import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hashToken } from "@/lib/invitations/token";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Crear cuenta · Iron Strength" };

const PROBLEMS: Record<string, string> = {
  inexistente: "Esta invitación no existe. Pídele otra a tu coach.",
  usada: "Esta invitación ya fue usada. Si eres tú, entra desde la pantalla de inicio de sesión.",
  vencida: "Esta invitación venció. Pídele otra a tu coach.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // validate_invitation es la única superficie pública de las invitaciones (DC-5).
  const supabase = await createClient();
  const { data } = await supabase.rpc("validate_invitation", { p_token_hash: hashToken(token) });
  const invitation = data?.[0];
  const valid = invitation?.status === "valida" && invitation.email;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">IRON STRENGTH</CardTitle>
          <CardDescription>
            {valid
              ? "Te invitaron a entrenar. Crea tu cuenta para empezar."
              : (PROBLEMS[invitation?.status ?? "inexistente"] ?? PROBLEMS.inexistente)}
          </CardDescription>
        </CardHeader>
        {valid ? (
          <CardContent>
            <RegisterForm token={token} email={invitation.email!} />
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
