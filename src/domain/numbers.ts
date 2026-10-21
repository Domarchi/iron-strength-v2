export function fromFormNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return undefined;
  return Number(text.replace(",", "."));
}

export const hasAtMostDecimals = (decimals: number) => (n: number) => {
  const factor = 10 ** decimals;
  return Math.abs(n * factor - Math.round(n * factor)) < 1e-9;
};
