// Galería interna del sistema de diseño v2 (T239). Solo existe en desarrollo y en las pruebas.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppBar,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  Menu,
  ProgressRing,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stat,
  Stepper,
  TextField,
  Toast,
  Toggle,
  Txt,
  useTheme,
} from "../ui";

export default function DesignGallery() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState("a");
  const [on, setOn] = useState(true);
  const [kg, setKg] = useState(57.5);
  const [chip, setChip] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState(false);
  const [name, setName] = useState("");
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View testID="design-gallery" style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar
        title="Sistema Forja"
        subtitle="Galería de componentes"
        onBack={() => {}}
        actions={<IconButton icon="more" label="Más opciones" onPress={() => setMenu(true)} />}
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: insets.bottom + 80 }}
      >
        <View style={{ gap: 6 }}>
          <Txt variant="display">Sentadilla</Txt>
          <Txt variant="number">57,5 kg × 8</Txt>
          <Txt muted>Ronda 2 · descanso 60 s</Txt>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Roles de acción" />
          <Button label="Primario · Empezar" onPress={() => {}} icon="play" />
          <Button
            label="Secundario · Descargar"
            onPress={() => {}}
            role="secondary"
            icon="download"
          />
          <Button label="Contorno · Cambiar" onPress={() => {}} role="outline" />
          <Button label="Enlace · Ver historial" onPress={() => {}} role="ghost" />
          <Button
            label="Peligro · Eliminar entrenamiento"
            onPress={() => setDialog(true)}
            role="danger"
          />
          <Button label="Guardando" onPress={() => {}} busy />
          <Button label="Deshabilitado" onPress={() => {}} disabled />
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Etiquetas" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Badge label="Pendiente" />
            <Badge label="Hecho" tone="ok" />
            <Badge label="Récord" tone="rec" />
            <Badge label="Error" tone="danger" />
            <Badge label="Activo" tone="accent" />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["4 sem", "8 sem", "12 sem", "Todo"].map((l, i) => (
              <Chip key={l} label={l} selected={chip === i} onPress={() => setChip(i)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Cifras" action={{ label: "Ver todo", onPress: () => {} }} />
          <Card>
            <View style={{ flexDirection: "row", gap: 24 }}>
              <Stat label="Duración" value="52" unit="min" />
              <Stat label="Volumen" value="2.175" unit="kg" />
              <Stat label="Récords" value="2" tone="rec" />
            </View>
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <ProgressRing value={0.5} label="Series completadas: 2 de 4">
              <Txt variant="label">2/4</Txt>
            </ProgressRing>
            <Avatar name="Ana" />
            <Avatar name="Coach" tone="accent" />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <SectionHeader title="Listas" />
          <ListRow
            title="Piernas"
            subtitle="2 ejercicios · 4 series"
            leading={<Avatar name="A" />}
            chevron
            onPress={() => {}}
          />
          <Divider />
          <ListRow
            title="Sin conexión"
            subtitle="Descargar esta semana"
            trailing={<Badge label="Nuevo" tone="accent" />}
            onPress={() => {}}
          />
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader title="Controles" />
          <SegmentedControl
            label="Apariencia"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "a", label: "Claro" },
              { value: "b", label: "Oscuro" },
              { value: "c", label: "Sistema" },
            ]}
          />
          <Toggle
            label="Recordatorios"
            description="Un aviso antes de entrenar"
            value={on}
            onChange={setOn}
          />
          <Stepper label="Peso" unit="kg" value={kg} onChange={setKg} step={2.5} />
          <TextField
            label="Nombre de la rutina"
            value={name}
            onChangeText={setName}
            hint="Hasta 60 caracteres"
          />
          <TextField
            label="Contraseña"
            value=""
            onChangeText={() => {}}
            error="Mínimo 8 caracteres"
          />
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Avisos" />
          <Banner tone="ok" title="Entrenamiento guardado" message="Se sincronizó con tu coach." />
          <Banner tone="rec" title="Récord nuevo" message="Sentadilla · 1RM estimado 71 kg." />
          <Banner
            tone="danger"
            title="No pudimos guardar"
            message="Revisa tu conexión e intenta de nuevo."
            action={{ label: "Reintentar", onPress: () => {} }}
          />
          <Banner message="Estás sin conexión. Tus series se guardan en este teléfono." />
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Carga y vacío" />
          <Skeleton height={20} width="60%" />
          <Skeleton height={56} />
          <EmptyState
            title="Aún no hay entrenamientos"
            body="Cuando termines tu primera sesión la verás aquí."
            action={{ label: "Empezar ahora", onPress: () => {} }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title="Superposiciones" />
          <Button label="Abrir hoja" onPress={() => setSheet(true)} role="secondary" />
          <Button label="Mostrar aviso breve" onPress={() => setToast(true)} role="secondary" />
        </View>
      </ScrollView>
      <Toast message="Serie guardada" visible={toast} onDone={() => setToast(false)} />
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Herramientas">
        <ListRow title="Calculadora de discos" onPress={() => setSheet(false)} chevron />
        <ListRow title="Preparar calentamientos" onPress={() => setSheet(false)} chevron />
      </Sheet>
      <Dialog
        visible={dialog}
        title="¿Eliminar entrenamiento?"
        message="Se borran sus series y comentarios. No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => setDialog(false)}
        onCancel={() => setDialog(false)}
        destructive
      />
      <Menu
        visible={menu}
        title="Más opciones"
        onClose={() => setMenu(false)}
        items={[
          { label: "Pausar", onPress: () => {} },
          { label: "Organizar ejercicios", onPress: () => {} },
          { label: "Descartar registro", onPress: () => {}, danger: true },
        ]}
      />
    </View>
  );
}
