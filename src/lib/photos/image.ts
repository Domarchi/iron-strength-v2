// Procesamiento de fotos en el dispositivo (RF-40, RF-43, DC-18): se reduce a 1280 px de lado
// mayor, se codifica en WebP (o JPEG si el navegador no sabe) y se baja la calidad hasta que pese
// menos de 1 MB. Los HEIC de iPhone se convierten antes. La lógica de decisión es pura y probada;
// `processImage` es la capa fina que usa el navegador (canvas).

export const MAX_SIDE = 1280;
export const PHOTO_LIMIT_BYTES = 1_048_576;

const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25] as const;
const SCALES = [1, 0.8, 0.64, 0.5] as const;

export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function isHeic(file: Pick<File, "name" | "type">): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export type Encoder = (quality: number, scale: number) => Promise<Blob>;

// Prueba calidades de mayor a menor; si ninguna alcanza, reduce el tamaño y repite.
export async function compressToLimit(args: {
  encode: Encoder;
  limit: number;
}): Promise<{ blob: Blob; quality: number; scale: number }> {
  for (const scale of SCALES) {
    for (const quality of QUALITIES) {
      const blob = await args.encode(quality, scale);
      if (blob.size <= args.limit) return { blob, quality, scale };
    }
  }
  throw new Error("No se pudo reducir la foto por debajo de 1 MB. Prueba con otra imagen.");
}

async function toBitmapSource(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  // HEIC: se convierte a JPEG con una librería que se carga solo cuando hace falta.
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(converted) ? converted[0] : converted;
}

export type ProcessedPhoto = {
  blob: Blob;
  type: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
};

// Devuelve la foto lista para subir. Lanza un Error con un mensaje apto para mostrar al usuario.
export async function processImage(file: File): Promise<ProcessedPhoto> {
  let source: Blob;
  try {
    source = await toBitmapSource(file);
  } catch {
    throw new Error(
      "No se pudo leer esa imagen. Si viene de un iPhone, prueba con una foto en JPEG.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error("Ese archivo no es una imagen válida o tu navegador no puede abrirla.");
  }

  const base = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no permite procesar imágenes.");

  const encodeAs =
    (type: ProcessedPhoto["type"]): Encoder =>
    (quality, scale) =>
      new Promise((resolve, reject) => {
        canvas.width = Math.max(1, Math.round(base.width * scale));
        canvas.height = Math.max(1, Math.round(base.height * scale));
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            blob && blob.type === type ? resolve(blob) : reject(new Error("formato no soportado")),
          type,
          quality,
        );
      });

  try {
    // Safari antiguo no codifica WebP: se cae a JPEG.
    for (const [type, extension] of [
      ["image/webp", "webp"],
      ["image/jpeg", "jpg"],
    ] as const) {
      try {
        const { blob } = await compressToLimit({
          encode: encodeAs(type),
          limit: PHOTO_LIMIT_BYTES,
        });
        return { blob, type, extension };
      } catch (error) {
        if (error instanceof Error && /reducir/i.test(error.message)) throw error;
        // formato no soportado: probar el siguiente
      }
    }
    throw new Error("Tu navegador no pudo preparar la foto.");
  } finally {
    bitmap.close();
  }
}
