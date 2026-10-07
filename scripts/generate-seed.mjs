// T33 · Genera supabase/seed.sql a partir del catálogo de ejercicios de Iron Strength v1.
// Uso: node scripts/generate-seed.mjs [ruta/a/exercises.js]
// El resultado se versiona; este script solo se vuelve a correr si cambia el catálogo de origen.
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const source =
  process.argv[2] ?? path.join(homedir(), "Developer/iron-strength/src/data/exercises.js");

const { default: exercises } = await import(pathToFileURL(source).href);

// Incremento sugerido por equipamiento (DC / RF-15b): 2,5 kg en barra, 1 a 2 kg en el resto.
const INCREMENT_BY_EQUIPMENT = {
  Barra: 2.5,
  "Trap bar": 2.5,
  "Máquina Smith": 2.5,
  Landmine: 2.5,
  Mancuernas: 2,
  Kettlebell: 2,
  Máquina: 2,
  Polea: 2,
  "Banda elástica": 1,
  Otro: 2,
  "Peso corporal": 1,
};
const GROUPS = new Set(["Pecho", "Espalda", "Hombros", "Brazos", "Piernas", "Core", "Cardio"]);

const sql = (text) => `'${String(text).replaceAll("'", "''")}'`;
const seen = new Map();
const rows = [];
const skipped = [];

for (const ex of exercises) {
  const name = String(ex.name).trim();
  const key = name.toLowerCase();
  if (!GROUPS.has(ex.muscleGroup)) throw new Error(`Grupo muscular desconocido: ${ex.muscleGroup}`);
  if (!(ex.equipment in INCREMENT_BY_EQUIPMENT)) throw new Error(`Equipamiento desconocido: ${ex.equipment}`);
  if (seen.has(key)) {
    skipped.push(`${name} (${ex.id}) duplica a ${seen.get(key)}`);
    continue;
  }
  seen.set(key, ex.id);
  rows.push(
    `  (${sql(name)}, ${sql(ex.muscleGroup)}, ${sql(ex.equipment)}, ${ex.equipment === "Peso corporal"}, ${INCREMENT_BY_EQUIPMENT[ex.equipment]})`,
  );
}

const out = `-- GENERADO por scripts/generate-seed.mjs desde Iron Strength v1. No editar a mano.
-- Catálogo base de ejercicios (coach_id nulo = global). Idempotente.

insert into public.exercises (name, muscle_group, equipment, is_bodyweight, progression_increment_kg)
values
${rows.join(",\n")}
on conflict do nothing;
`;

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), out);
console.log(`${rows.length} ejercicios escritos. ${skipped.length} duplicados omitidos.`);
for (const s of skipped) console.log("  - " + s);
