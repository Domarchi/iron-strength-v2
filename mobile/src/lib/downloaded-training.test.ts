import { describe, expect, it } from "vitest";
import { bundleSchema } from "../../../src/lib/offline/training-bundle";
import { trainingDownloadFixture } from "../../../src/test/fixtures/training-download";
import { assignedId as id } from "../../../src/test/fixtures/assigned-training";
import { downloadedPersonalRoutine, requireSamePersonalPreview } from "./downloaded-training";
describe("downloaded personal training", () => {
  it("keeps typed series, notes and rest after the assigned week expires", () => {
    const b = bundleSchema.parse(trainingDownloadFixture());
    const r = downloadedPersonalRoutine(b, id(1), id(9));
    expect(r).toEqual(b.library.routines[0]);
    expect(r?.items[0].prescribed.recordType).toBe("duration");
    expect(r?.items[0].restSeconds).toBe(45);
  });
  it("does not read another account, an absent bundle or missing routine", () => {
    const b = bundleSchema.parse(trainingDownloadFixture());
    expect(downloadedPersonalRoutine(b, id(8), id(9))).toBeNull();
    expect(downloadedPersonalRoutine(null, id(1), id(9))).toBeNull();
    expect(downloadedPersonalRoutine(b, id(1), id(88))).toBeNull();
  });
  it("requires review if revision, identity or target changed after preview", () => {
    const r = bundleSchema.parse(trainingDownloadFixture()).library.routines[0];
    expect(requireSamePersonalPreview(r, structuredClone(r))).toEqual(r);
    for (const next of [
      null,
      { ...r, revision: 2 },
      { ...r, id: id(88) },
      { ...r, name: "Changed" },
    ])
      expect(() => requireSamePersonalPreview(r, next)).toThrow(/revisar/);
    const next = structuredClone(r);
    next.items[0].prescribed.target.targetDurationSeconds = 90;
    expect(() => requireSamePersonalPreview(r, next)).toThrow(/revisar/);
  });
});
