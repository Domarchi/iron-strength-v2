"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { deleteMeasurement, saveMeasurement } from "@/lib/data/measurements";
import { createClient } from "@/lib/supabase/server";

export type MeasurementState =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "exists"; date: string }
  | { status: "error"; message: string };

export async function saveMeasurementAction(
  _prev: MeasurementState,
  fd: FormData,
): Promise<MeasurementState> {
  const user = await requireUser();
  const result = await saveMeasurement({
    db: await createClient(),
    studentId: user.id,
    replace: fd.get("replace") === "1",
    input: {
      measuredOn: String(fd.get("measuredOn") ?? ""),
      weightKg: String(fd.get("weightKg") ?? ""),
      waistCm: String(fd.get("waistCm") ?? ""),
      chestCm: String(fd.get("chestCm") ?? ""),
      armCm: String(fd.get("armCm") ?? ""),
    },
  });

  if (!result.ok) {
    if (result.reason === "exists") return { status: "exists", date: String(fd.get("measuredOn")) };
    return {
      status: "error",
      message:
        result.reason === "invalid"
          ? "Revisa los datos: al menos una medida; peso de 20 a 300 kg; cintura, pecho y brazo de 10 a 250 cm; la fecha no puede ser futura."
          : "No tienes permiso para registrar medidas.",
    };
  }
  revalidatePath("/body");
  return {
    status: "saved",
    message: result.replaced ? "Medidas reemplazadas." : "Medidas guardadas.",
  };
}

export async function deleteMeasurementAction(formData: FormData): Promise<void> {
  await requireUser();
  await deleteMeasurement({ db: await createClient(), id: String(formData.get("id") ?? "") });
  revalidatePath("/body");
}
