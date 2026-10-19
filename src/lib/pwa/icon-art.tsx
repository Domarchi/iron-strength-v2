// Arte del icono de la app: una mancuerna verde sobre fondo claro, dibujada con cajas para no
// depender de ninguna fuente. En la versión enmascarable el dibujo ocupa solo el centro (zona segura
// del 80 %), porque el sistema recorta los bordes con la forma que prefiera.
export function IconArt({ size, maskable }: { size: number; maskable: boolean }) {
  const scale = maskable ? 0.5 : 0.64;
  const w = size * scale; // ancho total de la mancuerna
  const plateH = w * 0.62;
  const plateW = w * 0.14;
  const innerH = w * 0.42;
  const innerW = w * 0.1;
  const barH = w * 0.1;
  const gap = w * 0.02;
  const green = "#236b50";
  const box = (width: number, height: number, radius: number) => ({
    width,
    height,
    borderRadius: radius,
    background: green,
  });

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f7f4",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap }}>
        <div style={box(plateW, plateH, plateW * 0.3)} />
        <div style={box(innerW, innerH, innerW * 0.3)} />
        <div style={box(w - 2 * (plateW + innerW + gap * 2), barH, barH * 0.4)} />
        <div style={box(innerW, innerH, innerW * 0.3)} />
        <div style={box(plateW, plateH, plateW * 0.3)} />
      </div>
    </div>
  );
}
