import { describe, expect, it } from "vitest";
import { createProject, historyReducer } from "./model";
import { STORAGE_KEY, makeShareUrl } from "./storage";
import {
  LIBRARY_KEY,
  RECOVERY_KEY,
  MAX_PROJECTS,
  MAX_VERSIONS,
  loadWorkspace,
  openWorkspace,
  readLibrary,
  recoverLibrary,
  removeWorkspace,
  saveWorkspace,
  type ProjectRef,
} from "./workspace";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return {
    values,
    storage,
    project: createProject(),
    ref: { id: "first", revision: null } as ProjectRef,
  };
}
describe("device project library", () => {
  it("migrates the legacy working copy without changing content or writing during load", () => {
    const { storage, values, project } = setup();
    project.name = "Existing work";
    values.set(STORAGE_KEY, JSON.stringify(project));
    const loaded = loadWorkspace(storage, "");
    expect(loaded.project).toEqual(project);
    expect(values.has(LIBRARY_KEY)).toBe(false);
    saveWorkspace(storage, loaded.ref, loaded.project);
    expect(readLibrary(storage).entries[0].project).toEqual(project);
    expect(loadWorkspace(storage, "").project).toEqual(project);
  });
  it("switches independent projects and keeps the library authoritative over the compatibility cache", () => {
    const { storage, values, project, ref } = setup();
    saveWorkspace(storage, ref, project);
    const second = { ...createProject(), name: "Second" };
    saveWorkspace(storage, { id: "second", revision: null }, second, {
      activate: true,
    });
    values.set(STORAGE_KEY, "{broken cache");
    expect(loadWorkspace(storage, "").project).toEqual(second);
    openWorkspace(storage, ref.id);
    expect(loadWorkspace(storage, "").project).toEqual(project);
    expect(readLibrary(storage).entries).toHaveLength(2);
  });
  it("stores immutable versions and removes only an explicitly selected version", () => {
    const { storage, project, ref } = setup();
    let saved = saveWorkspace(storage, ref, project, {
      versionName: "Before review",
    });
    project.brand = "After review";
    saved = saveWorkspace(storage, saved, project, {
      versionName: "After review",
    });
    const entry = readLibrary(storage).entries[0];
    expect(entry.versions.map((version) => version.name)).toEqual([
      "After review",
      "Before review",
    ]);
    expect(entry.versions[1].project.brand).not.toBe(project.brand);
    saveWorkspace(storage, saved, project, {
      removeVersion: entry.versions[0].id,
    });
    expect(
      readLibrary(storage).entries[0].versions.map((version) => version.name),
    ).toEqual(["Before review"]);
  });
  it("rejects stale writes, including stale version saves and deleted projects", () => {
    const { storage, project, ref } = setup();
    const original = saveWorkspace(storage, ref, project);
    const edited = { ...project, name: "Updated in another tab" };
    saveWorkspace(storage, original, edited);
    expect(() => saveWorkspace(storage, original, project)).toThrow(
      /another tab/,
    );
    expect(() =>
      saveWorkspace(storage, original, project, { versionName: "Stale" }),
    ).toThrow(/another tab/);
    expect(readLibrary(storage).entries[0].project).toEqual(edited);
    saveWorkspace(storage, { id: "other", revision: null }, createProject(), {
      activate: true,
    });
    removeWorkspace(storage, ref.id);
    expect(() => saveWorkspace(storage, original, project)).toThrow(
      /another tab/,
    );
  });
  it("merges saves to different projects without changing the selected project", () => {
    const { storage, project, ref } = setup();
    const first = saveWorkspace(storage, ref, project);
    const other = createProject();
    const second = saveWorkspace(
      storage,
      { id: "second", revision: null },
      other,
      { activate: true },
    );
    saveWorkspace(storage, first, { ...project, brand: "Updated first" });
    saveWorkspace(storage, second, { ...other, brand: "Updated second" });
    expect(readLibrary(storage).activeId).toBe("second");
    expect(
      readLibrary(storage).entries.map((entry) => entry.project.brand),
    ).toEqual(["Updated first", "Updated second"]);
  });
  it("does not rewrite unchanged data or introduce unnecessary revision conflicts", () => {
    const { storage, project, ref, values } = setup();
    const saved = saveWorkspace(storage, ref, project);
    const original = values.get(LIBRARY_KEY);
    expect(saveWorkspace(storage, saved, project)).toEqual(saved);
    expect(values.get(LIBRARY_KEY)).toBe(original);
  });
  it("preserves all saved data when a quota write fails", () => {
    const { storage, values, project, ref } = setup();
    const saved = saveWorkspace(storage, ref, project);
    const before = new Map(values);
    const full = {
      ...storage,
      setItem: () => {
        throw new Error("Quota");
      },
    };
    expect(() =>
      saveWorkspace(
        full,
        saved,
        { ...project, name: "Unsaved" },
        { versionName: "Not committed" },
      ),
    ).toThrow(/full or unavailable/);
    expect(values).toEqual(before);
  });
  it("enforces project and version limits without silently discarding old work", () => {
    const { storage, values, project, ref } = setup();
    let saved = saveWorkspace(storage, ref, project);
    for (let index = 0; index < MAX_VERSIONS; index++)
      saved = saveWorkspace(storage, saved, project, {
        versionName: `Version ${index}`,
      });
    const before = values.get(LIBRARY_KEY);
    expect(() =>
      saveWorkspace(storage, saved, project, { versionName: "Overflow" }),
    ).toThrow(/10 saved versions/);
    expect(values.get(LIBRARY_KEY)).toBe(before);
    for (let index = 1; index < MAX_PROJECTS; index++)
      saveWorkspace(
        storage,
        { id: `project-${index}`, revision: null },
        project,
      );
    expect(() =>
      saveWorkspace(storage, { id: "overflow", revision: null }, project),
    ).toThrow(/10 projects/);
    expect(readLibrary(storage).entries).toHaveLength(MAX_PROJECTS);
  });
  it("opens snapshots without writing to the recipient's library", () => {
    const { storage, values, project, ref } = setup();
    saveWorkspace(storage, ref, project);
    const before = new Map(values);
    const shared = { ...project, name: "Someone else's direction" };
    const loaded = loadWorkspace(
      storage,
      new URL(makeShareUrl(shared, "https://example.com")).hash,
    );
    expect(loaded.shared).toBe(true);
    expect(loaded.project).toEqual(shared);
    expect(values).toEqual(before);
    expect(loadWorkspace(storage, "#project=broken").project).toEqual(project);
  });
  it("rejects library byte overflow and oversized individual projects without evicting saved work", () => {
    const { storage, values, project, ref } = setup();
    const table = project.pages.table.find((block) => block.type === "table")!;
    table.rows = Array.from({ length: 100 }, () =>
      table.headers.map(() => "x".repeat(1500)),
    );
    let saved = saveWorkspace(storage, ref, project);
    for (let index = 0; index < 3; index++)
      saved = saveWorkspace(storage, saved, project, {
        versionName: `Large ${index}`,
      });
    const before = values.get(LIBRARY_KEY);
    expect(() =>
      saveWorkspace(storage, saved, project, { versionName: "Over budget" }),
    ).toThrow(/3 MB limit/);
    expect(values.get(LIBRARY_KEY)).toBe(before);
    table.rows = Array.from({ length: 100 }, () =>
      table.headers.map(() => "x".repeat(2000)),
    );
    expect(() => saveWorkspace(storage, saved, project)).toThrow(/too large/);
    expect(values.get(LIBRARY_KEY)).toBe(before);
  });
  it("protects unreadable libraries and backs up the exact original before explicit recovery", () => {
    const { storage, values } = setup();
    values.set(LIBRARY_KEY, "{broken library");
    const loaded = loadWorkspace(storage, "");
    expect(loaded.recovered).toBe(true);
    expect(() => saveWorkspace(storage, loaded.ref, loaded.project)).toThrow(
      /could not be read/,
    );
    expect(values.get(LIBRARY_KEY)).toBe("{broken library");
    recoverLibrary(storage);
    expect(
      [...values.entries()].some(
        ([key, value]) =>
          key.startsWith(RECOVERY_KEY) && value === "{broken library",
      ),
    ).toBe(true);
    saveWorkspace(storage, loaded.ref, loaded.project);
    expect(readLibrary(storage).entries).toHaveLength(1);
  });
  it("never resets an unreadable library if its recovery backup cannot be saved", () => {
    const { storage, values } = setup();
    values.set(LIBRARY_KEY, "{precious data");
    expect(() =>
      recoverLibrary({
        ...storage,
        setItem: () => {
          throw new Error("Full");
        },
      }),
    ).toThrow();
    expect(values.get(LIBRARY_KEY)).toBe("{precious data");
  });
  it("refuses invalid library references, versions, and oversized projects", () => {
    const { storage, values, project, ref } = setup();
    saveWorkspace(storage, ref, project);
    const library = readLibrary(storage);
    for (const invalid of [
      { ...library, activeId: "missing" },
      { ...library, entries: [...library.entries, library.entries[0]] },
      {
        ...library,
        entries: [
          {
            ...library.entries[0],
            project: { ...project, brand: "x".repeat(41) },
          },
        ],
      },
    ]) {
      values.set(LIBRARY_KEY, JSON.stringify(invalid));
      expect(() => readLibrary(storage)).toThrow(/could not be read/);
    }
  });
  it("requires another project to be open before removal", () => {
    const { storage, project, ref } = setup();
    saveWorkspace(storage, ref, project);
    expect(() => removeWorkspace(storage, ref.id)).toThrow(/Open another/);
    expect(() => openWorkspace(storage, "missing")).toThrow(/removed/);
  });
  it("clears session undo when opening another project while keeping version restoration undoable", () => {
    const one = createProject();
    const two = createProject();
    const history = {
      past: [one],
      present: { ...one, brand: "Edited" },
      future: [one],
    };
    expect(historyReducer(history, { type: "open", project: two })).toEqual({
      past: [],
      present: two,
      future: [],
    });
    const restored = historyReducer(history, { type: "change", project: one });
    expect(historyReducer(restored, { type: "undo" }).present).toEqual(
      history.present,
    );
  });
});
