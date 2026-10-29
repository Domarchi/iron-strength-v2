import { useState } from "react";
import { Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useTraining } from "../lib/training-context";
import { isTypedTraining, type CurrentTraining } from "../lib/training";
import { prepareWarmups, describeWarmup, type WarmupProposal } from "../lib/workout-tools";
import { trainingFields } from "../lib/training-fields";
import { type TrainingSetInput } from "../../../src/domain/training-input";
import { calculatePlates } from "../../../src/domain/training-tools";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { Action, IconAction, Notice, s, usePalette } from "./ui";
import {
  EquipmentEditor,
  ToolField,
  equipmentInput,
  readEquipment,
  toolNumber,
} from "./training-tool-fields";
export function WorkoutTools({
  active,
  index,
  onClose,
}: {
  active: CurrentTraining;
  index: number;
  onClose: () => void;
}) {
  const p = usePalette(),
    [tab, setTab] = useState<"home" | "plates" | "warmups" | "rest">("home");
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border, gap: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[s.subheading, { color: p.ink, flex: 1 }]}>
          Herramientas · {active.draft.exercises[index].name}
        </Text>
        <IconAction label="Cerrar herramientas" icon="close" onPress={onClose} />
      </View>
      {tab === "home" ? (
        <>
          <Action label="Calculadora de discos" secondary onPress={() => setTab("plates")} />
          <Action label="Preparar calentamientos" secondary onPress={() => setTab("warmups")} />
          <Action label="Ajustar descanso del ejercicio" quiet onPress={() => setTab("rest")} />
        </>
      ) : tab === "plates" ? (
        <PlateTool />
      ) : tab === "warmups" ? (
        <WarmupTool active={active} index={index} onCancel={() => setTab("home")} />
      ) : (
        <SessionRestTool active={active} index={index} />
      )}
      {tab === "plates" || tab === "rest" ? (
        <Action label="Volver a herramientas" quiet onPress={() => setTab("home")} />
      ) : null}
    </View>
  );
}
function PlateTool() {
  const p = usePalette(),
    { controller, preferences } = useTrainingPreferences();
  const [equipment, setEquipment] = useState(() => equipmentInput(preferences.value.equipment)),
    [target, setTarget] = useState(""),
    [result, setResult] = useState<ReturnType<typeof calculatePlates> | null>(null),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  const changed = () => {
    setResult(null);
    setError(null);
    setSaved(false);
  };
  function calculate() {
    setError(null);
    setResult(null);
    try {
      setResult(calculatePlates({ ...readEquipment(equipment), target: toolNumber(target) }));
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "Revisa la carga total: de 0 a 500, hasta dos decimales.",
      );
    }
  }
  async function saveEquipment() {
    setError(null);
    setSaved(false);
    try {
      await controller.save({ ...preferences.value, equipment: readEquipment(equipment) });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu equipo.");
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.caption, { color: p.muted }]}>
        Carga total con barra incluida. Reparto simétrico, sin redondeos.
      </Text>
      <ToolField
        label="Carga total"
        value={target}
        onChange={(v) => {
          setTarget(v);
          changed();
        }}
      />
      <EquipmentEditor
        value={equipment}
        onChange={(v) => {
          setEquipment(v);
          changed();
        }}
        disabled={preferences.busy}
      />
      <Action label="Calcular discos" onPress={calculate} />
      {result ? (
        result.ok ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            <Text style={[s.label, { color: p.ink }]}>
              Por lado:{" "}
              {result.perSide.length
                ? result.perSide
                    .map((v) => `${v.count} × ${v.weight.toLocaleString("es-CL")} ${result.unit}`)
                    .join(" + ")
                : "sin discos"}
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>
              Barra {result.bar.toLocaleString("es-CL")} {result.unit} · total{" "}
              {result.target.toLocaleString("es-CL")} {result.unit}
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>
              Solo consulta; no cambia los valores de tu serie.
            </Text>
          </View>
        ) : (
          <Notice
            message={
              result.reason === "below_bar"
                ? "La carga total es menor que el peso de la barra."
                : result.reason === "asymmetric"
                  ? "Esta carga no admite un reparto simétrico con la precisión del equipo."
                  : "No se puede componer esta carga con el equipo indicado."
            }
          />
        )
      ) : null}
      <Action
        label="Guardar equipo en este dispositivo"
        secondary
        disabled={!preferences.ready || preferences.blocked || preferences.paused}
        busy={preferences.busy}
        onPress={() => {
          void saveEquipment();
        }}
      />
      {saved ? (
        <Text accessibilityLiveRegion="polite" style={[s.caption, { color: p.success }]}>
          Equipo guardado en este dispositivo.
        </Text>
      ) : null}
      {error ? <Notice message={error} /> : null}
    </View>
  );
}
const emptyWarmup = (): TrainingSetInput => ({
  weight: "",
  reps: "",
  duration: "",
  distance: "",
  effort: "",
  setType: "warmup",
});
function WarmupTool({
  active,
  index,
  onCancel,
}: {
  active: CurrentTraining;
  index: number;
  onCancel: () => void;
}) {
  const p = usePalette(),
    { controller, training } = useTraining();
  const [rows, setRows] = useState<TrainingSetInput[]>(() => [emptyWarmup()]),
    [preview, setPreview] = useState<WarmupProposal | null>(null),
    [applied, setApplied] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const kind = isTypedTraining(active) ? active.draft.exercises[index].prescribed.recordType : null;
  const blocked =
    training.busy ||
    training.closing ||
    training.blocked ||
    training.dirty ||
    active.draft.status !== "in_progress" ||
    active.pause?.pausedAtMs != null;
  function review() {
    setError(null);
    try {
      setPreview(prepareWarmups(active, index, rows, randomUUID()));
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "Completa entre una y cinco series con métricas válidas.",
      );
    }
  }
  async function confirm() {
    if (!preview || busy || applied) return;
    setBusy(true);
    setError(null);
    try {
      await controller.addWarmups(preview);
      setApplied(true);
    } catch (e) {
      const current = controller.getSnapshot().active;
      if (
        current?.draft.workoutId === preview.workoutId &&
        current.draft.exercises.some((r) => r.sets.some((s) => s.id === `${preview.requestId}-0`))
      )
        setApplied(true);
      setError(e instanceof Error ? e.message : "No pudimos añadir los calentamientos.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.caption, { color: p.muted }]}>
        Configura tus series; sin recomendaciones automáticas.
      </Text>
      {applied ? (
        <>
          <Text accessibilityLiveRegion="polite" style={[s.label, { color: p.ink }]}>
            {training.dirty
              ? "Calentamientos añadidos en memoria; guardado local sin confirmar."
              : "Calentamientos añadidos y guardados en este dispositivo."}
          </Text>
          {training.dirty ? (
            <Action
              label="Reintentar guardado de calentamientos"
              disabled={busy || training.busy}
              onPress={() => {
                setBusy(true);
                void controller
                  .retryStorage()
                  .then(() => setError(null))
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
        </>
      ) : preview ? (
        <>
          <Text style={[s.label, { color: p.ink }]}>Revisa antes de añadir</Text>
          {preview.sets.map((r, i) => (
            <Text key={i} style={[s.body, { color: p.ink }]}>
              {describeWarmup(kind, r)}
            </Text>
          ))}
          <Text style={[s.caption, { color: p.muted }]}>
            Se añadirán antes de tus series, sin marcarlas completadas ni cambiar el descanso en
            curso.
          </Text>
          <Action
            label="Añadir calentamientos"
            busy={busy}
            disabled={blocked}
            onPress={() => {
              void confirm();
            }}
          />
          <Action
            label="Editar calentamientos"
            quiet
            disabled={busy}
            onPress={() => {
              setPreview(null);
              setError(null);
            }}
          />
        </>
      ) : (
        <>
          {rows.map((r, i) => (
            <View key={i} style={{ gap: 8 }}>
              <Text style={[s.label, { color: p.ink }]}>Calentamiento {i + 1}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {trainingFields(kind).map((f) => (
                  <ToolField
                    key={f.field}
                    label={`${f.label} calentamiento ${i + 1}`}
                    value={r[f.field]}
                    integer={f.integer}
                    disabled={blocked || busy}
                    onChange={(v) => {
                      setRows((rows) => rows.map((r, j) => (i === j ? { ...r, [f.field]: v } : r)));
                      setError(null);
                    }}
                  />
                ))}
              </View>
              {rows.length > 1 ? (
                <Action
                  label={`Quitar calentamiento ${i + 1}`}
                  quiet
                  disabled={busy}
                  onPress={() => setRows((r) => r.filter((_, j) => i !== j))}
                />
              ) : null}
            </View>
          ))}
          <Action
            label="Otra serie de calentamiento"
            secondary
            disabled={blocked || rows.length >= 5}
            onPress={() => setRows((r) => [...r, emptyWarmup()])}
          />
          <Action label="Revisar calentamientos" disabled={blocked} onPress={review} />
        </>
      )}
      {error ? <Notice message={error} /> : null}
      {!applied ? (
        <Action label="Cancelar calentamientos" quiet disabled={busy} onPress={onCancel} />
      ) : null}
    </View>
  );
}
function SessionRestTool({ active, index }: { active: CurrentTraining; index: number }) {
  const p = usePalette(),
    { controller, training } = useTraining(),
    { preferences } = useTrainingPreferences();
  const e = active.draft.exercises[index];
  const [value, setValue] = useState(
      String((e.supersetId ? e.supersetRestSeconds : e.restSeconds) ?? 90),
    ),
    [preview, setPreview] = useState<{ seconds: number; expectedDraft: string } | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const blocked =
    training.busy ||
    training.dirty ||
    training.closing ||
    active.pause?.pausedAtMs != null ||
    active.draft.status !== "in_progress";
  function review() {
    setError(null);
    setSaved(false);
    try {
      const seconds = toolNumber(value, true);
      if (seconds > 600 || seconds % 15) throw Error("Usa de 0 a 600 segundos en pasos de 15.");
      setPreview({ seconds, expectedDraft: JSON.stringify(active.draft) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={[s.caption, { color: p.muted }]}>
        {e.supersetId
          ? "Se aplica a todos los integrantes de esta superserie."
          : "Solo para este ejercicio en este entrenamiento."}{" "}
        No cambia tu rutina ni el temporizador que ya está en marcha.
      </Text>
      <ToolField
        label="Descanso del ejercicio en segundos"
        value={value}
        integer
        disabled={blocked || busy}
        onChange={(v) => {
          setValue(v);
          setPreview(null);
          setSaved(false);
        }}
      />
      <Action
        label={`Usar mi descanso habitual · ${preferences.value.restSeconds} s`}
        quiet
        disabled={blocked}
        onPress={() => {
          setValue(String(preferences.value.restSeconds));
          setPreview(null);
          setSaved(false);
        }}
      />
      {preview ? (
        <>
          <Text style={[s.label, { color: p.ink }]}>Nuevo descanso: {preview.seconds} s</Text>
          <Action
            label="Confirmar descanso"
            busy={busy}
            disabled={blocked}
            onPress={() => {
              setBusy(true);
              setError(null);
              void controller
                .setSessionRest({
                  workoutId: active.draft.workoutId,
                  rowId: e.sessionExerciseId,
                  ...preview,
                })
                .then(() => {
                  setPreview(null);
                  setSaved(true);
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
          <Action
            label="Cancelar cambio de descanso"
            quiet
            disabled={busy}
            onPress={() => setPreview(null)}
          />
        </>
      ) : (
        <Action label="Revisar descanso" disabled={blocked} onPress={review} />
      )}
      {saved ? (
        <Text accessibilityLiveRegion="polite" style={[s.caption, { color: p.success }]}>
          Descanso guardado para este entrenamiento.
        </Text>
      ) : null}
      {error ? <Notice message={error} /> : null}
    </View>
  );
}
