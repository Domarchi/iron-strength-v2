import { z } from "zod";
export type WeightUnit = "kg" | "lb";
export type DistanceUnit = "m" | "km" | "mi";
export type DisplayUnit = WeightUnit | DistanceUnit;
const factors: Record<DisplayUnit, number> = {
  kg: 1,
  lb: 0.45359237,
  m: 1,
  km: 1000,
  mi: 1609.344,
};
export function toDisplay(canonical: number, unit: DisplayUnit) {
  if (!Number.isFinite(canonical)) throw Error("Valor no válido.");
  return canonical / factors[unit];
}
export function fromDisplay(value: number, unit: DisplayUnit) {
  if (!Number.isFinite(value)) throw Error("Valor no válido.");
  return value * factors[unit];
}
const format = (value: number, unit: DisplayUnit) =>
  `${toDisplay(value, unit).toLocaleString("es-CL", { maximumFractionDigits: 2 })} ${unit}`;
export const formatWeight = (kg: number, unit: WeightUnit = "kg") => format(kg, unit);
export const formatDistance = (meters: number, unit: DistanceUnit = "m") => format(meters, unit);
const hundredths = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .refine((n) => Number(n.toFixed(2)) === n);
export const plateEquipmentSchema = z
  .object({
    unit: z.enum(["kg", "lb"]),
    bar: hundredths(100),
    plates: z
      .array(
        z
          .object({
            weight: hundredths(100).refine((n) => n > 0),
            pairs: z.number().int().min(0).max(20),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .refine((e) => new Set(e.plates.map((p) => p.weight)).size === e.plates.length);
export type PlateEquipment = z.infer<typeof plateEquipmentSchema>;
const plateRequestSchema = z
  .object({ equipment: plateEquipmentSchema, target: hundredths(500) })
  .strict();
type PlateResult =
  | {
      ok: true;
      unit: WeightUnit;
      bar: number;
      target: number;
      perSide: { weight: number; count: number }[];
    }
  | { ok: false; reason: "below_bar" | "asymmetric" | "unavailable" };
/** Bounded integer knapsack. Each count is the available number of pairs, not unlimited stock. */
export function calculatePlates(input: PlateEquipment & { target: number }): PlateResult {
  const { target: rawTarget, ...rawEquipment } = input;
  const { equipment, target } = plateRequestSchema.parse({
    equipment: rawEquipment,
    target: rawTarget,
  });
  const difference = Math.round(target * 100) - Math.round(equipment.bar * 100);
  if (difference < 0) return { ok: false, reason: "below_bar" };
  if (difference % 2) return { ok: false, reason: "asymmetric" };
  const side = difference / 2;
  const plates = [...equipment.plates].sort((a, b) => b.weight - a.weight);
  // Process large denominations first; retain that solution for an equal plate count.
  let solutions: ({ counts: number[]; total: number } | undefined)[] = Array(side + 1);
  solutions[0] = { counts: [], total: 0 };
  for (const plate of plates) {
    const next: typeof solutions = Array(side + 1),
      cents = Math.round(plate.weight * 100);
    for (let amount = 0; amount <= side; amount++) {
      const before = solutions[amount];
      if (!before) continue;
      for (
        let count = Math.min(plate.pairs, Math.floor((side - amount) / cents));
        count >= 0;
        count--
      ) {
        const sum = amount + count * cents,
          total = before.total + count;
        const candidate = [...before.counts, count],
          current = next[sum];
        const largerFirst =
          current &&
          candidate.some(
            (n, j) =>
              n !== current.counts[j] &&
              candidate.slice(0, j).every((x, k) => x === current.counts[k]) &&
              n > current.counts[j],
          );
        if (!current || total < current.total || (total === current.total && largerFirst))
          next[sum] = { counts: candidate, total };
      }
    }
    solutions = next;
  }
  const solution = solutions[side];
  if (!solution) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    unit: equipment.unit,
    bar: equipment.bar,
    target,
    perSide: plates.flatMap((p, i) =>
      solution.counts[i] ? [{ weight: p.weight, count: solution.counts[i] }] : [],
    ),
  };
}
