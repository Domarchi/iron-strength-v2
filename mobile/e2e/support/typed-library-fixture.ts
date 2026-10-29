import type { Page } from "@playwright/test";
import { setupPersonalLibrary } from "./library-fixture";
import { downloadId } from "../../../src/test/fixtures/week-download";
import { typedResultFixture } from "../../../src/test/fixtures/typed-result";
import {
  typedPersonalLibrarySchema,
  typedPersonalMutationSchema,
  type TypedPersonalMutation,
  type TypedPersonalMutationResult,
} from "../../../src/lib/mobile/typed-personal-contracts";
const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
export async function setupTypedPersonalLibrary(page: Page) {
  await setupPersonalLibrary(page);
  const fixture = typedResultFixture(),
    state = {
      value: typedPersonalLibrarySchema.parse({
        version: 2,
        userId: downloadId(1),
        folders: [],
        routines: [],
      }),
      calls: [] as TypedPersonalMutation[],
      receipts: new Map<string, TypedPersonalMutationResult>(),
      lose: false,
      conflict: false,
    };
  await page.route(api + "/training-catalog", (route) => route.fulfill({ json: fixture.catalog }));
  await page.route(api + "/training-library**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: state.value });
    const input = typedPersonalMutationSchema.parse(route.request().postDataJSON());
    state.calls.push(input);
    const receipt = state.receipts.get(input.requestId);
    if (receipt) return route.fulfill({ json: { ...receipt, duplicate: true } });
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
    const base = state.value.routines.find((r) => r.id === input.targetId);
    if (input.operation !== "routine_create" && input.operation !== "routine_save")
      throw Error("Unsupported typed fixture operation");
    const next = {
      id: input.targetId,
      name: input.data.name,
      folderId: input.operation === "routine_create" ? input.data.folderId : base!.folderId,
      revision: (base?.revision ?? 0) + 1,
      position: base?.position ?? state.value.routines.length,
      createdAt: base?.createdAt ?? "2026-10-27T12:00:00Z",
      updatedAt: "2026-10-27T12:00:00Z",
      items: input.data.items.map((r, position) => ({
        ...fixture.catalog.exercises.find((e) => e.id === r.exerciseId)!,
        ...r,
        position,
      })),
    };
    state.value = typedPersonalLibrarySchema.parse({
      ...state.value,
      routines: state.value.routines.filter((r) => r.id !== next.id).concat(next),
    });
    const result: TypedPersonalMutationResult = {
      version: 2,
      requestId: input.requestId,
      targetId: input.targetId,
      status: input.operation === "routine_create" ? "created" : "updated",
      revision: next.revision,
      duplicate: false,
    };
    state.receipts.set(input.requestId, result);
    return state.lose
      ? ((state.lose = false),
        route.fulfill({
          status: 503,
          json: {
            version: 1,
            error: { code: "unavailable", message: "No pudimos confirmar el guardado." },
          },
        }))
      : route.fulfill({ json: result });
  });
  return { state, fixture };
}
