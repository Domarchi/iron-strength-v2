import { useState } from "react";
import { Text, View } from "react-native";
import {
  detailPersonalItem,
  simplifyPersonalItem,
  type PersonalEditorItem,
} from "../../../src/domain/personal-routines";
import { Action, Notice, s, usePalette } from "./ui";
import { MoreButton, PersonalField, SelectionMark } from "./personal-controls";
type ItemAction = "up" | "down" | "duplicate" | "remove" | "detach" | "earlier" | "later";
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
          <Action
            label="Detalles"
            accessibilityLabel={`Editar detalles de ${item.name}`}
            quiet
            onPress={() => {
              setDetails(!details);
              onMenu();
            }}
          />
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
          <View style={{ flex: 2, gap: 5 }}>
            <Text style={[s.caption, { color: p.muted }]}>Repeticiones</Text>
            <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
              <PersonalField
                label={`Repeticiones mínimas de ${item.name}`}
                value={item.repsMin}
                onChange={(repsMin) => change({ repsMin })}
                numeric
                maxLength={20}
                disabled={disabled}
              />
              <Text style={{ color: p.muted }}>–</Text>
              <PersonalField
                label={`Repeticiones máximas de ${item.name}`}
                value={item.repsMax}
                onChange={(repsMax) => change({ repsMax })}
                numeric
                maxLength={20}
                disabled={disabled}
              />
            </View>
          </View>
          <PersonalField
            title="kg"
            label={`Peso de ${item.name}`}
            value={item.targetWeightKg}
            onChange={(targetWeightKg) => change({ targetWeightKg })}
            numeric
            maxLength={20}
            disabled={disabled}
          />
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
                  {(["repsMin", "repsMax", "targetWeightKg"] as const).map((field, fieldIndex) => (
                    <PersonalField
                      key={field}
                      title={index === 0 ? ["Mín.", "Máx.", "kg"][fieldIndex] : undefined}
                      label={`${["Repeticiones mínimas", "Repeticiones máximas", "Peso objetivo"][fieldIndex]} de la serie ${index + 1} de ${item.name}`}
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
      {details ? (
        <View style={{ gap: 12, paddingTop: 6 }}>
          <PersonalField
            title="Descanso (s)"
            label={`Descanso de ${item.name}`}
            value={item.restSeconds}
            numeric
            maxLength={20}
            disabled={disabled}
            onChange={(restSeconds) => change({ restSeconds })}
          />
          <PersonalField
            title="Nota (opcional)"
            label={`Nota de ${item.name}`}
            value={item.note}
            multiline
            maxLength={500}
            disabled={disabled}
            onChange={(note) => change({ note })}
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
                Se usará el primer objetivo en todas las series: {item.series![0].repsMin}–
                {item.series![0].repsMax} repeticiones
                {item.series![0].targetWeightKg
                  ? ` · ${item.series![0].targetWeightKg} kg`
                  : " · sin peso indicado"}
                .
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
          <Action label="Ocultar detalles" quiet onPress={() => setDetails(false)} />
        </View>
      ) : null}
    </View>
  );
}
