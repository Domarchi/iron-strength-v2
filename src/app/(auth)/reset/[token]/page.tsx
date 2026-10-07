import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña · Iron Strength" };

// El enlace se verifica al enviar el formulario (así abrirlo no lo consume).
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">IRON STRENGTH</CardTitle>
          <CardDescription>Elige una contraseña nueva para tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
