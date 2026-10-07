// Opciones de equipamiento y su incremento de progresión por defecto (mismas reglas que el seed
// del catálogo de v1, ver scripts/generate-seed.mjs).
export const EQUIPMENT = [
  "Barra",
  "Mancuernas",
  "Máquina",
  "Polea",
  "Peso corporal",
  "Máquina Smith",
  "Kettlebell",
  "Landmine",
  "Trap bar",
  "Banda elástica",
  "Otro",
] as const;

const INCREMENTS: Record<string, number> = {
  Barra: 2.5,
  "Trap bar": 2.5,
  "Máquina Smith": 2.5,
  Landmine: 2.5,
  Mancuernas: 2,
  Kettlebell: 2,
  Máquina: 2,
  Polea: 2,
  Otro: 2,
  "Banda elástica": 1,
  "Peso corporal": 1,
};

export function defaultIncrementFor(equipment: string | null): number {
  return (equipment && INCREMENTS[equipment]) || 2.5;
}
