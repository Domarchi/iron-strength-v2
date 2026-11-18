// Guía breve de ejecución por ejercicio (spec 012, T247). Texto general y prudente: no reemplaza
// la indicación de quien entrena a la persona ni es consejo médico. El coach puede añadir notas
// propias en cada rutina; esta guía solo cubre lo básico cuando no hay otra indicación.

export type GuideInput = {
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isBodyweight: boolean;
};
export type ExerciseGuide = { summary: string; steps: string[]; avoid: string };

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const specific: [RegExp, ExerciseGuide][] = [
  [
    /^sentadilla( frontal| goblet)?$/,
    {
      summary: "Piernas y glúteos con apoyo del core.",
      steps: [
        "Pies al ancho de hombros, puntas algo abiertas.",
        "Baja con la espalda neutra, rodillas siguiendo la línea de los pies.",
        "Sube empujando el suelo sin despegar los talones.",
      ],
      avoid: "Que las rodillas se vayan hacia dentro o que la espalda se redondee al bajar.",
    },
  ],
  [
    /^press de banca( inclinado| declinado)?$/,
    {
      summary: "Pecho, hombros y tríceps.",
      steps: [
        "Escápulas juntas y apoyadas en el banco, pies firmes en el suelo.",
        "Baja la barra controlada hasta rozar el pecho, codos a unos 45°.",
        "Empuja hacia arriba hasta extender los brazos sin bloquear de golpe.",
      ],
      avoid: "Rebotar la barra en el pecho o despegar la cadera del banco.",
    },
  ],
  [
    /^peso muerto( sumo| rumano)?$/,
    {
      summary: "Cadena posterior: glúteos, isquiotibiales y espalda.",
      steps: [
        "Barra pegada a las piernas, espalda neutra y abdomen firme.",
        "Empuja el suelo y lleva la cadera adelante al subir.",
        "Baja la barra cerca del cuerpo, controlando el movimiento.",
      ],
      avoid: "Redondear la espalda o tirar de la barra con los brazos.",
    },
  ],
  [
    /^dominadas( supinas)?$/,
    {
      summary: "Espalda ancha y bíceps.",
      steps: [
        "Agarre firme, hombros lejos de las orejas al empezar.",
        "Tira llevando los codos hacia las costillas hasta pasar la barbilla.",
        "Baja lento hasta extender los brazos.",
      ],
      avoid: "Balancearte para tomar impulso.",
    },
  ],
  [
    /^remo/,
    {
      summary: "Espalda media y dorsales.",
      steps: [
        "Tronco estable y espalda neutra durante todo el movimiento.",
        "Lleva los codos hacia atrás juntando las escápulas.",
        "Vuelve controlando, sin soltar el peso.",
      ],
      avoid: "Usar el impulso del tronco para subir la carga.",
    },
  ],
  [
    /^press militar$|^press de hombro|^press arnold$/,
    {
      summary: "Hombros y tríceps.",
      steps: [
        "Abdomen y glúteos firmes para que la zona lumbar no se arquee.",
        "Empuja el peso hacia arriba, ligeramente adelante de la cabeza.",
        "Baja controlado hasta la altura de las clavículas.",
      ],
      avoid: "Arquear la espalda para ayudarte a subir.",
    },
  ],
  [
    /^plancha/,
    {
      summary: "Estabilidad del core.",
      steps: [
        "Codos bajo los hombros y cuerpo en línea recta.",
        "Aprieta abdomen y glúteos durante todo el tiempo.",
        "Respira de forma continua; no aguantes la respiración.",
      ],
      avoid: "Dejar caer la cadera o subirla como una tienda de campaña.",
    },
  ],
  [
    /^hip thrust$|^puente de gluteo$/,
    {
      summary: "Glúteos.",
      steps: [
        "Espalda alta apoyada y pies firmes bajo las rodillas.",
        "Sube la cadera hasta alinear tronco y muslos, apretando glúteos arriba.",
        "Baja controlado sin perder la tensión.",
      ],
      avoid: "Arquear la zona lumbar al terminar la subida.",
    },
  ],
];

const byGroup: Record<string, ExerciseGuide> = {
  pecho: {
    summary: "Trabaja el pecho, con ayuda de hombros y tríceps.",
    steps: ["Hombros atrás y abajo, pecho firme.", "Recorrido completo y controlado, sin rebotes."],
    avoid: "Subir los hombros hacia las orejas o abrir demasiado los codos.",
  },
  espalda: {
    summary: "Trabaja la espalda, con ayuda de los bíceps.",
    steps: [
      "Empieza el movimiento llevando las escápulas hacia atrás.",
      "Mantén el tronco estable y la espalda neutra.",
    ],
    avoid: "Tirar con los brazos o balancear el cuerpo.",
  },
  piernas: {
    summary: "Trabaja piernas y glúteos.",
    steps: [
      "Apoyo firme en todo el pie y rodillas alineadas con los pies.",
      "Baja controlado y empuja el suelo para subir.",
    ],
    avoid: "Que las rodillas colapsen hacia dentro o perder la postura de la espalda.",
  },
  hombros: {
    summary: "Trabaja los hombros.",
    steps: ["Cuello relajado y abdomen firme.", "Sube y baja controlado, sin impulso."],
    avoid: "Encogerte de hombros o usar impulso de piernas y espalda.",
  },
  brazos: {
    summary: "Trabaja bíceps o tríceps.",
    steps: ["Codos estables junto al cuerpo.", "Mueve solo el antebrazo, sin balancear el tronco."],
    avoid: "Cargar tanto peso que necesites balancearte.",
  },
  core: {
    summary: "Trabaja el abdomen y la estabilidad del tronco.",
    steps: ["Abdomen firme y respiración continua.", "Movimientos lentos, sin tirones del cuello."],
    avoid: "Tirar del cuello con las manos o arquear la zona lumbar.",
  },
  cardio: {
    summary: "Trabajo aeróbico para la condición física.",
    steps: [
      "Empieza suave y sube la intensidad poco a poco.",
      "Mantén un ritmo con el que puedas respirar sin ahogarte.",
    ],
    avoid: "Partir a máxima intensidad sin entrar en calor.",
  },
};
const fallback: ExerciseGuide = {
  summary: "Ejercicio de fuerza.",
  steps: ["Controla la bajada y la subida.", "Mantén la espalda neutra y el abdomen firme."],
  avoid: "Subir peso a costa de perder la técnica.",
};

/** Guía de ejecución: específica para los movimientos principales y por grupo muscular en el resto. */
export function exerciseGuide(input: GuideInput): ExerciseGuide {
  const name = norm(input.name);
  const exact = specific.find(([re]) => re.test(name));
  const base = exact?.[1] ?? byGroup[norm(input.muscleGroup ?? "")] ?? fallback;
  const note = input.isBodyweight
    ? "Si te cuesta, reduce el rango o busca una variante más fácil antes de forzar."
    : input.equipment
      ? `Empieza con un peso que te permita mantener la técnica (${input.equipment.toLowerCase()}).`
      : "Empieza con un peso que te permita mantener la técnica.";
  return { ...base, steps: [...base.steps, note] };
}
