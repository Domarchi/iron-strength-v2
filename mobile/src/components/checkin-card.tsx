import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MobileCheckin, MobileCheckinAnswers } from "../../../src/lib/mobile/contracts";
import { fonts } from "../ui/tokens";
import { Action, Input, Notice, s, usePalette } from "./ui";

const questions = [
  { key: "sleep", label: "Sueño", low: "mal", high: "muy bien" },
  { key: "energy", label: "Energía", low: "baja", high: "alta" },
  { key: "soreness", label: "Dolor muscular", low: "ninguno", high: "mucho" },
  { key: "motivation", label: "Motivación", low: "baja", high: "alta" },
] as const;
type Key = (typeof questions)[number]["key"];

function Rating({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const p = usePalette();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: 8 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            role="radio"
            aria-checked={on}
            aria-label={`${label} ${n}`}
            accessibilityLabel={`${label} ${n}`}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? p.button : p.raised,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: on ? p.onButton : p.ink }}
            >
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Check-in semanal: cuatro respuestas de 1 a 5 y una nota opcional que ve tu coach.
 * Se envía una vez por semana y se puede corregir; un fallo conserva lo escrito para reintentar.
 */
export function CheckinCard({
  current,
  onSave,
}: {
  current: MobileCheckin;
  onSave: (answers: MobileCheckinAnswers) => Promise<void>;
}) {
  const p = usePalette();
  const [editing, setEditing] = useState(false),
    [values, setValues] = useState<Record<Key, number | null>>({
      sleep: current.answers?.sleep ?? null,
      energy: current.answers?.energy ?? null,
      soreness: current.answers?.soreness ?? null,
      motivation: current.answers?.motivation ?? null,
    }),
    [note, setNote] = useState(current.answers?.note ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const sent = current.answers !== null && !editing;
  const complete = questions.every((q) => values[q.key] !== null);
  async function send() {
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        sleep: values.sleep!,
        energy: values.energy!,
        soreness: values.soreness!,
        motivation: values.motivation!,
        note: note.trim() === "" ? null : note.trim(),
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu check-in. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      role="group"
      aria-label="Check-in semanal"
      accessibilityLabel="Check-in semanal"
      style={[s.card, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1, gap: 12 }]}
    >
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Check-in de la semana
      </Text>
      {sent ? (
        <>
          <Text style={[s.body, { color: p.success }]}>Enviado. Tu coach ya puede verlo.</Text>
          <Action label="Corregir mi check-in" quiet onPress={() => setEditing(true)} />
        </>
      ) : (
        <>
          <Text style={[s.caption, { color: p.muted }]}>
            ¿Cómo te sentiste esta semana? Responde de 1 a 5; lo ve tu coach.
          </Text>
          {questions.map((q) => (
            <View key={q.key} style={{ gap: 6 }}>
              <Text style={[s.label, { color: p.ink }]}>
                {q.label}{" "}
                <Text style={{ color: p.muted, fontSize: 12 }}>
                  (1 {q.low} · 5 {q.high})
                </Text>
              </Text>
              <Rating
                label={q.label}
                value={values[q.key]}
                disabled={busy}
                onChange={(n) => setValues((v) => ({ ...v, [q.key]: n }))}
              />
            </View>
          ))}
          <Input
            accessibilityLabel="Nota para tu coach"
            placeholder="Nota opcional"
            multiline
            maxLength={300}
            editable={!busy}
            value={note}
            onChangeText={setNote}
            style={{ minHeight: 64 }}
          />
          {error ? <Notice message={error} /> : null}
          <Action
            label="Enviar check-in"
            busy={busy}
            disabled={!complete}
            onPress={() => {
              void send();
            }}
          />
          {current.answers ? (
            <Action label="Cancelar" quiet disabled={busy} onPress={() => setEditing(false)} />
          ) : null}
        </>
      )}
    </View>
  );
}
