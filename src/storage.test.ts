import { describe, expect, it } from "vitest";
import { createProject } from "./model";
import {
  loadProject,
  makeShareUrl,
  MAX_PROJECT_SIZE,
  parseProject,
  saveProject,
  STORAGE_KEY,
} from "./storage";

describe("portable projects", () => {
  it("roundtrips all templates, multiline text, Unicode, and theme through a snapshot link", () => {
    const project = createProject();
    project.brand = "Café ☀";
    project.name = "Meeting / 你好";
    project.theme.preset = "atelier";
    const url = new URL(
      makeShareUrl(project, "https://formlane.example/?template=table"),
    );
    expect(url.searchParams.get("template")).toBe("table");
    const loaded = loadProject({ getItem: () => null }, url.hash);
    expect(loaded.project).toEqual(project);
    expect(loaded.shared).toBe(true);
  });
  it("prefers a shared snapshot over the local project without writing to storage", () => {
    const local = createProject();
    local.brand = "Local";
    const shared = createProject();
    shared.brand = "Shared";
    const snapshot = new URL(makeShareUrl(shared, "https://formlane.example"));
    expect(
      loadProject({ getItem: () => JSON.stringify(local) }, snapshot.hash)
        .project.brand,
    ).toBe("Shared");
  });
  it("falls back to the local project for a corrupted or oversized shared link", () => {
    const project = createProject();
    project.brand = "Safe local copy";
    const storage = { getItem: () => JSON.stringify(project) };
    expect(loadProject(storage, "#project=broken").project).toEqual(project);
    expect(
      loadProject(storage, `#project=${"a".repeat(48_001)}`).project,
    ).toEqual(project);
    expect(loadProject(storage, "#project=broken").notice).toMatch(
      /could not be opened/,
    );
  });
  it("reports malformed JSON, incompatible schemas, and oversized imports", () => {
    expect(() => parseProject("{")).toThrow(/not valid JSON/);
    expect(() => parseProject('{"version":900}')).toThrow(/not a supported/);
    expect(() => parseProject(" ".repeat(MAX_PROJECT_SIZE + 1))).toThrow(
      /too large/,
    );
    expect(() => parseProject("界".repeat(250_001))).toThrow(/too large/);
  });
  it("renders imported HTML as strings without permitting arbitrary theme code", () => {
    const project = createProject();
    project.brand = "<img onerror=alert(1)>";
    expect(parseProject(JSON.stringify(project)).brand).toEqual(project.brand);
    expect(() =>
      parseProject(
        JSON.stringify({
          ...project,
          theme: { ...project.theme, preset: "url(javascript:alert(1))" },
        }),
      ),
    ).toThrow();
  });
});

describe("local persistence", () => {
  it("shares the selected template without reopening the introduction", () => {
    const project = createProject();
    const url = new URL(
      makeShareUrl(
        project,
        "https://formlane.example/?template=kanban&intro=video",
      ),
    );
    expect(url.searchParams.get("template")).toBe("kanban");
    expect(url.searchParams.has("intro")).toBe(false);
    expect(loadProject({ getItem: () => null }, url.hash).project).toEqual(
      project,
    );
  });
  it("roundtrips through browser storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const project = createProject();
    expect(saveProject(storage, project)).toBe(true);
    expect(values.has(STORAGE_KEY)).toBe(true);
    expect(loadProject(storage, "").project).toEqual(project);
  });
  it("pauses saving when local data is corrupted or storage is unavailable", () => {
    expect(loadProject({ getItem: () => "{corrupt" }, "").recovered).toBe(true);
    const unavailable = {
      getItem: () => {
        throw new Error("Blocked");
      },
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    };
    expect(loadProject(unavailable, "").recovered).toBe(true);
    expect(saveProject(unavailable, createProject())).toBe(false);
  });
  it("creates a valid fresh project when there is no local project", () => {
    const loaded = loadProject({ getItem: () => null }, "");
    expect(parseProject(JSON.stringify(loaded.project))).toEqual(
      loaded.project,
    );
    expect(loaded.recovered).toBeUndefined();
  });
});
