/** «1 serie», «2 series»: concordancia de número para textos de la interfaz. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
