import { buildChart } from "@/domain/chart";

// Gráfico de líneas accesible en SVG (RF-30, RF-39). Sirve en claro y oscuro porque usa las
// variables de color del tema. Lleva una descripción para lectores de pantalla; la tabla de datos
// equivalente se ofrece en la página que lo usa.
export function LineChart({
  points,
  label,
  formatY,
  formatX = (x) => x,
}: {
  points: { x: string; y: number }[];
  label: string;
  formatY: (y: number) => string;
  formatX?: (x: string) => string;
}) {
  const width = 320;
  const height = 180;
  const chart = buildChart(points, {
    width,
    height,
    padding: { top: 12, right: 14, bottom: 26, left: 46 },
  });

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay datos para graficar.</p>;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const description = `${label}: de ${formatY(first.y)} el ${formatX(first.x)} a ${formatY(last.y)} el ${formatX(last.x)}, en ${points.length} ${points.length === 1 ? "registro" : "registros"}.`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={description}
      className="h-auto w-full"
    >
      {chart.yTickPositions.map((tick) => (
        <g key={tick.value}>
          <line
            x1={chart.area.left}
            x2={chart.area.right}
            y1={tick.py}
            y2={tick.py}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={chart.area.left - 6}
            y={tick.py + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {formatY(tick.value)}
          </text>
        </g>
      ))}

      {points.length > 1 ? (
        <path
          d={chart.path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {chart.points.map((p, index) => (
        <circle
          key={`${index}-${p.x}-${p.y}`}
          cx={p.px}
          cy={p.py}
          r="4"
          fill="var(--primary)"
          stroke="var(--background)"
          strokeWidth="1.5"
        >
          <title>{`${formatX(p.x)}: ${formatY(p.y)}`}</title>
        </circle>
      ))}

      <text x={chart.area.left} y={height - 6} fontSize="10" fill="var(--muted-foreground)">
        {formatX(first.x)}
      </text>
      {points.length > 1 ? (
        <text
          x={chart.area.right}
          y={height - 6}
          textAnchor="end"
          fontSize="10"
          fill="var(--muted-foreground)"
        >
          {formatX(last.x)}
        </text>
      ) : null}
    </svg>
  );
}
