import { useState } from "react";
import { Text, View } from "react-native";
import {
  detailTypedPersonalItem as detailPersonalItem,
  personalTargetFields,
  simplifyTypedPersonalItem as simplifyPersonalItem,
  type TypedPersonalEditorItem as PersonalEditorItem,
  type TypedEditableTarget,
} from "../../../src/domain/typed-personal-routines";
import { Action, Notice, s, usePalette } from "./ui";
import { MoreButton, PersonalField, SelectionMark } from "./personal-controls";
type ItemAction = "up" | "down" | "duplicate" | "remove" | "detach" | "earlier" | "later";
const targetInfo: Record<
  keyof TypedEditableTarget,
  { title: string; label: string; seriesLabel: string }
> = {
  repsMin: { title: "Mín.", label: "Repeticiones mínimas", seriesLabel: "Repeticiones mínimas" },
  repsMax: { title: "Máx.", label: "Repeticiones máximas", seriesLabel: "Repeticiones máximas" },
  targetWeightKg: { title: "kg", label: "Peso", seriesLabel: "Peso objetivo" },
  targetDurationSeconds: { title: "s", label: "Tiempo", seriesLabel: "Tiempo objetivo" },
  targetDistanceMeters: { title: "m", label: "Distancia", seriesLabel: "Distancia objetivo" },
};
function rawTargetLabel(target: TypedEditableTarget, item: PersonalEditorItem) {
  return personalTargetFields(item.recordType)
    .map((key) => `${targetInfo[key].title}: ${target[key] || "sin indicar"}`)
    .join(" · ");
}
export function PersonalEditorRow({
  item,
  selected,
  onToggle,
  onChange,
  onAction,
  disabled,
  menuOpen,
  onMenu,
  canUp,
  canDown,
  canEarlier,
  canLater,
}: {
  item: PersonalEditorItem;
  selected: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PersonalEditorItem>) => void;
  onAction: (action: ItemAction) => void;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  canEarlier: boolean;
  canLater: boolean;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const p = usePalette(),
    [details, setDetails] = useState(false),
    [simplify, setSimplify] = useState(false),
    [error, setError] = useState<string | null>(null);
  function change(patch: Partial<PersonalEditorItem>) {
    setError(null);
    onChange(patch);
  }
  function toDetail() {
    try {
      change(detailPersonalItem(item));
      setDetails(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function toSimple() {
    if (item.series && new Set(item.series.map((target) => JSON.stringify(target))).size > 1) {
      setSimplify(true);
      return;
    }
    change(simplifyPersonalItem(item));
  }
  return (
    <View style={{ gap: 10, paddingVertical: 12, borderBottomWidth: 0.5, borderColor: p.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <SelectionMark
          label={`Seleccionar ${item.name}`}
          checked={selected}
          onPress={onToggle}
          disabled={disabled}
        />
        <Text style={[s.label, { flex: 1, color: p.ink, fontSize: 16, fontWeight: "600" }]}>
          {item.name}
        </Text>
        <MoreButton label={`Acciones de ${item.name}`} onPress={onMenu} disabled={disabled} />
      </View>
      {menuOpen ? (
        <View style={{ backgroundColor: p.raised, borderRadius: 10, padding: 8, gap: 2 }}>
          <View style={s.row}>
            <Action
              label="Subir"
              accessibilityLabel={`Subir ${item.name}`}
              secondary
              disabled={disabled || !canUp}
              onPress={() => onAction("up")}
            />
            <Action
              label="Bajar"
              accessibilityLabel={`Bajar ${item.name}`}
              secondary
              disabled={disabled || !canDown}
              onPress={() => onAction("down")}
            />
          </View>
          {item.supersetId ? (
            <View style={s.row}>
              <Action
                label="Antes"
                accessibilityLabel="Antes en superserie"
                quiet
                disabled={disabled || !canEarlier}
                onPress={() => onAction("earlier")}
              />
              <Action
                label="Después"
                accessibilityLabel="Después en superserie"
                quiet
                disabled={disabled || !canLater}
                onPress={() => onAction("later")}
              />
            </View>
          ) : null}
          {item.supersetId ? (
            <Action
              label="Sacar de superserie"
              quiet
              disabled={disabled}
              onPress={() => onAction("detach")}
            />
          ) : null}
          <Action
            label="Duplicar ejercicio"
            quiet
            disabled={disabled}
            onPress={() => onAction("duplicate")}
          />
          <Action
            label="Quitar de la rutina"
            quiet
            disabled={disabled}
            onPress={() => onAction("remove")}
          />
          <Action label="Cerrar acciones de ejercicio" quiet onPress={onMenu} />
        </View>
      ) : null}
      {error ? <Notice message={error} /> : null}
      {!item.series ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
          <PersonalField
            title="Series"
            label={`Series de ${item.name}`}
            value={item.sets}
            onChange={(sets) => change({ sets })}
            numeric
            maxLength={20}
            disabled={disabled}
          />
          {personalTargetFields(item.recordType).map((field) => (
            <PersonalField
              key={field}
              title={targetInfo[field].title}
              label={`${targetInfo[field].label} de ${item.name}`}
              value={item[field]}
              onChange={(value) => change({ [field]: value })}
              numeric
              maxLength={20}
              disabled={disabled}
            />
          ))}
        </View>
      ) : (
        <>
          <View style={s.row}>
            <Text style={[s.caption, { color: p.muted }]}>Objetivos por serie</Text>
            <Action
              label={details ? "Ocultar objetivos" : "Ver objetivos"}
              quiet
              onPress={() => setDetails(!details)}
            />
          </View>
          {details ? (
            <>
              <View style={s.row}>
                <Action
                  label="−"
                  accessibilityLabel={`Quitar una serie de ${item.name}`}
                  secondary
                  disabled={disabled || item.series.length <= 1}
                  onPress={() =>
                    change({
                      series: item.series!.slice(0, -1),
                      sets: String(item.series!.length - 1),
                    })
                  }
                />
                <Text style={[s.label, { color: p.ink }]}>{item.series.length} series</Text>
                <Action
                  label="+"
                  accessibilityLabel={`Agregar una serie a ${item.name}`}
                  secondary
                  disabled={disabled || item.series.length >= 10}
                  onPress={() =>
                    change({
                      series: [...item.series!, { ...item.series!.at(-1)! }],
                      sets: String(item.series!.length + 1),
                    })
                  }
                />
              </View>
              {item.series.map((target, index) => (
                <View key={index} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                  <Text
                    style={[
                      s.caption,
                      s.number,
                      { color: p.muted, minWidth: 18, paddingBottom: 12 },
                    ]}
                  >
                    {index + 1}
                  </Text>
                  {personalTargetFields(item.recordType).map((field) => (
                    <PersonalField
                      key={field}
                      title={index === 0 ? targetInfo[field].title : undefined}
                      label={`${targetInfo[field].seriesLabel} de la serie ${index + 1} de ${item.name}`}
                      value={target[field]}
                      numeric
                      maxLength={20}
                      disabled={disabled}
                      onChange={(value) =>
                        change({
                          series: item.series!.map((entry, n) =>
                            n === index ? { ...entry, [field]: value } : entry,
                          ),
                        })
                      }
                    />
                  ))}
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {item.supersetId ? (
          <Text style={[s.caption, { color: p.muted }]}>Descanso por ronda</Text>
        ) : (
          <>
            <Text style={[s.caption, { color: p.muted }]}>Descanso</Text>
            <View style={{ width: 72 }}>
              <PersonalField
                label={`Descanso de ${item.name}`}
                value={item.restSeconds}
                numeric
                maxLength={20}
                disabled={disabled}
                onChange={(restSeconds) => change({ restSeconds })}
              />
            </View>
            <Text style={[s.caption, { color: p.muted }]}>s</Text>
          </>
        )}
        <View style={{ flex: 1 }} />
        <Action
          label={details ? "Ocultar detalles" : "Detalles"}
          accessibilityLabel={details ? "Ocultar detalles" : `Editar detalles de ${item.name}`}
          quiet
          onPress={() => {
            setDetails(!details);
            if (menuOpen) onMenu();
          }}
        />
      </View>
      {details ? (
        <View style={{ gap: 12, paddingTop: 6 }}>
          {item.supersetId ? (
            <PersonalField
              title="Descanso fuera del grupo (s)"
              label={`Descanso de ${item.name}`}
              value={item.restSeconds}
              numeric
              maxLength={20}
              disabled={disabled}
              onChange={(restSeconds) => change({ restSeconds })}
            />
          ) : null}
          <PersonalField
            title="Nota (opcional)"
            label={`Nota de ${item.name}`}
            value={item.note}
            multiline
            maxLength={10000}
            disabled={disabled}
            onChange={(note) => change({ note: Array.from(note).slice(0, 500).join("") })}
          />
          <Action
            label={item.series ? "Todas iguales" : "Por serie"}
            accessibilityLabel={
              item.series
                ? `Usar todas iguales en ${item.name}`
                : `Prescribir por serie en ${item.name}`
            }
            secondary
            disabled={disabled}
            onPress={item.series ? toSimple : toDetail}
          />
          {simplify ? (
            <>
              <Text style={[s.body, { color: p.ink }]}>
                Se usará el primer objetivo en todas las series:{" "}
                {rawTargetLabel(item.series![0], item)}.
              </Text>
              <Action
                label="Confirmar todas iguales"
                disabled={disabled}
                onPress={() => {
                  change(simplifyPersonalItem(item));
                  setSimplify(false);
                }}
              />
              <Action
                label="Mantener objetivos distintos"
                quiet
                onPress={() => setSimplify(false)}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
