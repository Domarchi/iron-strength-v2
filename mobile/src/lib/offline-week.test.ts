import { describe, expect, it } from "vitest";
import { downloadId, weekDownloadFixture } from "../../../src/test/fixtures/week-download";
import {
  downloadedRoutine,
  downloadedCanStart,
  downloadedWeekCurrent,
  downloadedHistory,
} from "./offline-week";
const user = downloadId(1),
  session = downloadId(3);
describe("consulta y comienzo desde copia propia", () => {
  it("consulta sin iniciar y conserva detalle por serie, alternativas y grupo", () => {
    const pack = weekDownloadFixture(),
      routine = downloadedRoutine(pack, user, session)!;
    expect(routine.exercises[0].prescribed.series).toHaveLength(2);
    expect(routine.exercises[0].alternatives?.[0].exerciseId).toBe(downloadId(6));
    expect(routine.exercises[0].supersetId).toBe(routine.exercises[1].supersetId);
    expect(downloadedRoutine(pack, downloadId(99), session)).toBeNull();
    expect(downloadedRoutine(pack, user, downloadId(99))).toBeNull();
  });
  it("solo inicia en los límites de la semana y vigencia; copia vencida sigue consultable", () => {
    const pack = weekDownloadFixture();
    for (const today of ["2026-10-19", "2026-10-25"])
      expect(downloadedCanStart(pack, user, session, today)).toBe(true);
    for (const today of ["2026-10-18", "2026-10-26"])
      expect(downloadedCanStart(pack, user, session, today)).toBe(false);
    expect(downloadedRoutine(pack, user, session)).not.toBeNull();
    expect(
      downloadedCanStart(
        { ...pack, program: { ...pack.program, endsOn: "2026-10-22" } },
        user,
        session,
        "2026-10-23",
      ),
    ).toBe(false);
    expect(downloadedWeekCurrent({ ...pack, sessions: [], history: {} }, user, "2026-10-24")).toBe(
      true,
    );
  });
  it("historial descargado solo de la cuenta y ejercicio realizado, sin inventar resultados completos", () => {
    const pack = weekDownloadFixture();
    expect(downloadedHistory(pack, user, downloadId(6))).toEqual({ items: [], nextCursor: null });
    expect(downloadedHistory(pack, downloadId(99), downloadId(6))).toBeNull();
    expect(downloadedHistory(pack, user, "__proto__")).toBeNull();
    expect(downloadedHistory(null, user, downloadId(6))).toBeNull();
  });
});
