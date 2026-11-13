import { useCallback, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { santiagoDate } from "../../../../src/domain/dates";
import { Action, Page, ScreenIntro } from "../../components/ui";
import { Banner } from "../../ui/feedback";
import { Button } from "../../ui/actions";
import { TextField } from "../../ui/controls";
import { Divider, EmptyState, ListRow, SectionHeader } from "../../ui/display";
import { Dialog } from "../../ui/overlay";
import { Txt } from "../../ui/text";
import { MobileError } from "../../lib/client";
import { parseMeasurement, type MeasurementFields } from "../../lib/measurement-input";
import { useQuery } from "../../lib/use-query";
import { useSession } from "../../lib/session";

const blank: MeasurementFields = { weightKg: "", waistCm: "", chestCm: "", armCm: "" };
const fmt = (n: number | null, unit: string) =>
  n === null ? null : `${String(n).replace(".", ",")} ${unit}`;

/** Medidas corporales propias: peso y perímetros de hoy. Las fotos de progreso siguen en la web. */
export default function Measurements() {
  const { client, state } = useSession();
  const query = useQuery(useCallback(() => client.measurements(), [client]));
  const [today] = useState(() => santiagoDate(new Date()));
  const [fields, setFields] = useState<MeasurementFields>(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [replace, setReplace] = useState(false),
    [saved, setSaved] = useState<string | null>(null),
    [removing, setRemoving] = useState<string | null>(null);
  if (state.status !== "authenticated") return null;

  async function save(confirmReplace: boolean) {
    const parsed = parseMeasurement(fields);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const status = await client.saveMeasurement(
        { measuredOn: today, ...parsed.value },
        confirmReplace,
      );
      setSaved(status === "replaced" ? "Medidas reemplazadas." : "Medidas guardadas.");
      setFields(blank);
      setReplace(false);
      query.retry();
    } catch (e) {
      if (e instanceof MobileError && e.code === "exists") setReplace(true);
      else setError(e instanceof Error ? e.message : "No pudimos guardar tus medidas. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await client.deleteMeasurement(id);
      setRemoving(null);
      query.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminar el registro. Reintenta.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }
  const set = (key: keyof MeasurementFields) => (value: string) =>
    setFields((f) => ({ ...f, [key]: value }));
  const items = query.value ?? [];
  return (
    <Page compact>
      <Action label="Volver a Cuenta" quiet onPress={() => router.navigate("/account")} />
      <ScreenIntro
        title="Medidas corporales"
        description="Guarda tu peso y tus perímetros. Tu coach puede verlos."
      />
      <View style={{ gap: 12 }}>
        <SectionHeader title={`Hoy · ${today.split("-").reverse().join("/")}`} />
        <TextField
          label="Peso (kg)"
          keyboardType="decimal-pad"
          value={fields.weightKg}
          onChangeText={set("weightKg")}
          maxLength={6}
        />
        <TextField
          label="Cintura (cm)"
          keyboardType="decimal-pad"
          value={fields.waistCm}
          onChangeText={set("waistCm")}
          maxLength={6}
        />
        <TextField
          label="Pecho (cm)"
          keyboardType="decimal-pad"
          value={fields.chestCm}
          onChangeText={set("chestCm")}
          maxLength={6}
        />
        <TextField
          label="Brazo (cm)"
          keyboardType="decimal-pad"
          value={fields.armCm}
          onChangeText={set("armCm")}
          maxLength={6}
        />
        {error ? <Banner tone="danger" message={error} /> : null}
        {saved ? <Banner tone="ok" message={saved} /> : null}
        {replace ? (
          <Banner
            tone="rec"
            title="Ya tienes medidas de hoy"
            message="Si continúas, se reemplazan completas por las que escribiste."
            action={{ label: "Reemplazar medidas de hoy", onPress: () => void save(true) }}
          />
        ) : (
          <Button label="Guardar medidas" busy={busy} onPress={() => void save(false)} />
        )}
      </View>
      <View style={{ gap: 4 }}>
        <SectionHeader title="Historial" />
        {query.error ? (
          <Banner
            tone="danger"
            message={query.error}
            action={{ label: "Reintentar", onPress: query.retry }}
          />
        ) : null}
        {query.value && items.length === 0 ? (
          <EmptyState
            title="Aún no tienes medidas"
            body="Guarda la primera arriba y aparecerá aquí."
          />
        ) : null}
        {items.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={m.measuredOn.split("-").reverse().join("/")}
              subtitle={
                [
                  fmt(m.weightKg, "kg"),
                  fmt(m.waistCm, "cm cintura"),
                  fmt(m.chestCm, "cm pecho"),
                  fmt(m.armCm, "cm brazo"),
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos"
              }
              accessibilityLabel={`Medidas del ${m.measuredOn}`}
              trailing={
                <Button
                  label="Eliminar"
                  accessibilityLabel={`Eliminar medidas del ${m.measuredOn}`}
                  role="danger"
                  size="sm"
                  full={false}
                  onPress={() => setRemoving(m.id)}
                />
              }
            />
          </View>
        ))}
      </View>
      <Txt variant="caption" muted>
        Las fotos de progreso se gestionan desde la web.
      </Txt>
      <Dialog
        visible={removing !== null}
        title="¿Eliminar estas medidas?"
        message="Se borra solo este registro. No se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
      />
    </Page>
  );
}
