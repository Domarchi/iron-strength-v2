// Alta única del coach. Uso (las credenciales van por entorno, nunca por argumentos ni chat):
//   COACH_EMAIL=... COACH_PASSWORD=... COACH_NAME="..." \
//   node --env-file=.env.local scripts/create-coach.ts
import { createClient } from "@supabase/supabase-js";
import { createCoach } from "../src/lib/admin/create-coach.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return value;
}

const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const { id } = await createCoach(admin as never, {
    email: required("COACH_EMAIL"),
    password: required("COACH_PASSWORD"),
    name: required("COACH_NAME"),
  });
  console.log(`Coach creado (id ${id}).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
