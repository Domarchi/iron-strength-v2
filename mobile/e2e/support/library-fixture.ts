import {
  typedPersonalMutationSchema,
  upgradePersonalLibrary,
} from "../../../src/lib/mobile/typed-personal-contracts";
import type { Page } from "@playwright/test";
import { setupDownloadedWeek } from "./week-fixture";
import { downloadId } from "../../../src/test/fixtures/week-download";
import {
  personalMutationSchema,
  type PersonalLibrary,
  type PersonalMutation,
  type PersonalMutationResult,
} from "../../../src/lib/mobile/personal-contracts";
export const libraryExercises = [
  {
    id: downloadId(800),
    name: "Press de banca",
    muscleGroup: "Pecho",
    equipment: "Barra",
    isBodyweight: false,
    progressionIncrementKg: 2.5,
  },
  {
    id: downloadId(801),
    name: "Remo con mancuerna",
    muscleGroup: "Espalda",
    equipment: "Mancuernas",
    isBodyweight: false,
    progressionIncrementKg: 2,
  },
  {
    id: downloadId(802),
    name: "Sentadilla",
    muscleGroup: "Piernas",
    equipment: "Barra",
    isBodyweight: false,
    progressionIncrementKg: 2.5,
  },
] as const;
export async function setupPersonalLibrary(page: Page) {
  const week = await setupDownloadedWeek(page);
  const state = {
    value: { version: 1, userId: downloadId(1), folders: [], routines: [] } as PersonalLibrary,
    calls: [] as PersonalMutation[],
    receipts: new Map<string, PersonalMutationResult>(),
    loseResponse: false,
    conflict: false,
  };
  const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  await page.route(origin + "/week", (route) =>
    route.fulfill({ json: { version: 1, kind: "no_program" } }),
  );
  await page.route(origin + "/exercises", (route) =>
    route.fulfill({ json: { version: 1, exercises: libraryExercises } }),
  );
  // These legacy regression fixtures intentionally keep their old data shape.
  // The protocol2 bridge is limited to legacy null, never modern metrics.
  const handleLibrary = async (route: import("@playwright/test").Route) => {
    const modern = new URL(route.request().url()).pathname.includes("/training-library");
    if (route.request().method() === "GET")
      return route.fulfill({ json: modern ? upgradePersonalLibrary(state.value) : state.value });
    let body: unknown = route.request().postDataJSON();
    if (modern) {
      const input2 = typedPersonalMutationSchema.parse(body);
      if (input2.operation === "routine_create" || input2.operation === "routine_save") {
        body = {
          ...input2,
          version: 1,
          data: {
            ...input2.data,
            items: input2.data.items.map((item) => {
              if (item.prescribed.recordType !== null)
                throw Error("Modern metrics require typed fixtures");
              const { prescribed, ...common } = item;
              return {
                ...common,
                sets: prescribed.sets,
                repsMin: prescribed.target.repsMin,
                repsMax: prescribed.target.repsMax,
                targetWeightKg: prescribed.target.targetWeightKg,
                series:
                  prescribed.series?.map((t) => ({
                    repsMin: t.repsMin,
                    repsMax: t.repsMax,
                    targetWeightKg: t.targetWeightKg,
                  })) ?? null,
              };
            }),
          },
        };
      } else body = { ...input2, version: 1 };
    }
    const input = personalMutationSchema.parse(body);
    state.calls.push(input);
    const previous = state.receipts.get(input.requestId);
    if (previous)
      return route.fulfill({
        json: { ...previous, ...(modern ? { version: 2 } : {}), duplicate: true },
      });
    if (state.conflict) {
      state.conflict = false;
      return route.fulfill({
        status: 409,
        json: {
          version: 1,
          error: { code: "conflict", message: "La rutina cambió en otra ventana." },
        },
      });
    }
    const routine = state.value.routines.find((r) => r.id === input.targetId);
    let status: PersonalMutationResult["status"] = "updated",
      revision: number | null = null;
    if (input.operation === "routine_create" || input.operation === "routine_save") {
      const row = {
        id: input.targetId,
        name: input.data.name,
        folderId: input.operation === "routine_create" ? input.data.folderId : routine!.folderId,
        position:
          routine?.position ??
          state.value.routines.filter(
            (r) =>
              r.folderId === (input.operation === "routine_create" ? input.data.folderId : null),
          ).length,
        revision: (routine?.revision ?? 0) + 1,
        createdAt: routine?.createdAt ?? "2026-10-24T15:00:00Z",
        updatedAt: "2026-10-24T15:00:00Z",
        items: input.data.items.map((item, position) => ({
          ...libraryExercises.find((e) => e.id === item.exerciseId)!,
          ...item,
          position,
        })),
      };
      state.value.routines = state.value.routines.filter((r) => r.id !== row.id).concat(row);
      revision = row.revision;
      status = input.operation === "routine_create" ? "created" : "updated";
    } else if (input.operation === "routine_copy") {
      const source = state.value.routines.find((r) => r.id === input.data.sourceId)!;
      const groups = new Map<string, string>();
      state.value.routines.push({
        ...source,
        id: input.targetId,
        name: input.data.name,
        folderId: input.data.folderId,
        position: state.value.routines.filter((r) => r.folderId === input.data.folderId).length,
        revision: 1,
        items: source.items.map((item, index) => {
          if (item.supersetId && !groups.has(item.supersetId))
            groups.set(item.supersetId, downloadId(900 + index));
          return {
            ...item,
            id: downloadId(950 + index),
            supersetId: item.supersetId ? groups.get(item.supersetId)! : null,
            series: item.series?.map((s) => ({ ...s })) ?? null,
          };
        }),
      });
      revision = 1;
      status = "copied";
    } else if (input.operation === "folder_create") {
      state.value.folders.push({
        id: input.targetId,
        name: input.data.name,
        position: state.value.folders.length,
        revision: 0,
      });
      revision = 0;
      status = "created";
    } else if (input.operation === "folder_rename") {
      const f = state.value.folders.find((f) => f.id === input.targetId)!;
      f.name = input.data.name;
      revision = ++f.revision;
    } else if (input.operation === "routine_delete") {
      state.value.routines = state.value.routines.filter((r) => r.id !== input.targetId);
      status = "deleted";
    } else if (input.operation === "routine_move") {
      routine!.folderId = input.data.folderId;
      routine!.position = state.value.routines.filter(
        (r) => r.id !== routine!.id && r.folderId === input.data.folderId,
      ).length;
      revision = ++routine!.revision;
      status = "moved";
    } else if (input.operation === "folder_delete") {
      let pos =
        Math.max(
          -1,
          ...state.value.routines.filter((r) => r.folderId === null).map((r) => r.position),
        ) + 1;
      for (const r of state.value.routines.filter((r) => r.folderId === input.targetId)) {
        r.folderId = null;
        r.position = pos++;
        r.revision++;
      }
      state.value.folders = state.value.folders.filter((f) => f.id !== input.targetId);
      status = "deleted";
    } else if (input.operation === "routines_reorder" || input.operation === "folders_reorder") {
      input.data.entries.forEach(({ id }, position) => {
        const row =
          input.operation === "routines_reorder"
            ? state.value.routines.find((r) => r.id === id)!
            : state.value.folders.find((r) => r.id === id)!;
        row.position = position;
        row.revision++;
      });
      status = "reordered";
    }
    const result = {
      requestId: input.requestId,
      targetId: input.targetId,
      revision,
      status,
      duplicate: false,
    };
    state.receipts.set(input.requestId, result);
    if (state.loseResponse) {
      state.loseResponse = false;
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "No pudimos confirmar el guardado." },
        },
      });
    }
    return route.fulfill({ json: { ...result, ...(modern ? { version: 2 } : {}) } });
  };
  await page.route(origin + "/library**", handleLibrary);
  await page.route(origin + "/training-library**", handleLibrary);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  return { state, week };
}
