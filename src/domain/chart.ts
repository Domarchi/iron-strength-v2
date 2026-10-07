// Geometría de un gráfico de líneas simple (RF-30, RF-39): escalas "bonitas" y puntos en pantalla.
// Pura y probada; el componente solo dibuja lo que esto calcula.

export type ChartPoint = { x: string; y: number };

export function niceTicks(min: number, max: number, target = 5): number[] {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const rawStep = (hi - lo) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  // Escala clásica 1-2-5-10: el paso es el menor "redondo" que no deja el eje demasiado apretado.
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  // Marcas redondas: 0,2 + 0,4 no debe dar 0,6000000000000001
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const round = (n: number) => Number(n.toFixed(decimals));

  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(round(v));
  return ticks;
}

export type ChartOptions = {
  width: number;
  height: number;
  padding?: { top: number; right: number; bottom: number; left: number };
};

export type Chart = {
  points: { x: string; y: number; px: number; py: number }[];
  path: string;
  yTicks: number[];
  yTickPositions: { value: number; py: number }[];
  area: { left: number; right: number; top: number; bottom: number };
};

export function buildChart(data: ChartPoint[], options: ChartOptions): Chart {
  const pad = options.padding ?? { top: 12, right: 12, bottom: 24, left: 40 };
  const area = {
    left: pad.left,
    right: options.width - pad.right,
    top: pad.top,
    bottom: options.height - pad.bottom,
  };

  if (data.length === 0) return { points: [], path: "", yTicks: [], yTickPositions: [], area };

  const ys = data.map((d) => d.y);
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const ySpan = yMax - yMin || 1;
  const scaleY = (y: number) => area.bottom - ((y - yMin) / ySpan) * (area.bottom - area.top);

  const points = data.map((d, i) => ({
    ...d,
    px:
      data.length === 1
        ? (area.left + area.right) / 2
        : area.left + (i / (data.length - 1)) * (area.right - area.left),
    py: scaleY(d.y),
  }));

  return {
    points,
    path: points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)} ${p.py.toFixed(1)}`)
      .join(" "),
    yTicks,
    yTickPositions: yTicks.map((value) => ({ value, py: scaleY(value) })),
    area,
  };
}
