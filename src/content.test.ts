import { describe, expect, it } from "vitest";
import {
  appendImportedSections,
  contentImportSchema,
  type ContentSection,
} from "./content";
import { createProject, projectSchema, historyReducer } from "./model";
import { parseProject, makeShareUrl, loadProject } from "./storage";

const sections: ContentSection[] = [
  {
    id: "source-text",
    type: "text",
    title: "Imported story",
    body: "A little borrowed structure.",
  },
  {
    id: "source-table",
    type: "table",
    title: "Plan",
    headers: ["Idea", "Owner"],
    rows: [["Explore", "Sam"]],
  },
];
describe("applying imported content", () => {
  it("adds selected sections after the active section without replacing content or changing other pages and theme", () => {
    const project = createProject();
    const result = appendImportedSections(
      project,
      "webshop",
      sections,
      project.pages.webshop[0].id,
    );
    expect(result.pages.webshop.map((section) => section.type)).toEqual([
      "hero",
      "text",
      "table",
      "products",
      "quote",
    ]);
    expect(result.pages.kanban).toEqual(project.pages.kanban);
    expect(result.pages.table).toEqual(project.pages.table);
    expect(result.theme).toEqual(project.theme);
    expect(project.pages.webshop).toHaveLength(3);
  });
  it("creates fresh IDs on every import and retains valid project files and share snapshots", () => {
    const initial = createProject();
    const first = appendImportedSections(initial, "table", sections, null);
    const second = appendImportedSections(first, "table", sections, null);
    expect(projectSchema.safeParse(second).success).toBe(true);
    expect(parseProject(JSON.stringify(second))).toEqual(second);
    expect(
      loadProject(
        { getItem: () => null },
        new URL(makeShareUrl(second, "https://formlane.example/")).hash,
      ).project,
    ).toEqual(second);
  });
  it("undoes and redoes an entire content import in one step", () => {
    const initial = createProject();
    const imported = appendImportedSections(initial, "webshop", sections, null);
    const changed = historyReducer(
      { past: [], present: initial, future: [] },
      { type: "change", project: imported },
    );
    expect(historyReducer(changed, { type: "undo" }).present).toEqual(initial);
    expect(
      historyReducer(historyReducer(changed, { type: "undo" }), {
        type: "redo",
      }).present,
    ).toEqual(imported);
  });
  it("refuses empty selections and overfilling a page", () => {
    const project = createProject();
    expect(() =>
      appendImportedSections(project, "webshop", [], null),
    ).toThrow();
    expect(() =>
      appendImportedSections(
        project,
        "webshop",
        Array.from({ length: 22 }, () => sections[0]),
        null,
      ),
    ).toThrow(/24-section/);
  });
  it("rejects unsupported section types, duplicate IDs, unsafe source URLs, and malformed tables from an endpoint", () => {
    const base = {
      source: { url: "https://example.com/", title: "Example" },
      scope: "main",
      markdown: "# Example",
      sections,
      notes: [],
    };
    expect(contentImportSchema.safeParse(base).success).toBe(true);
    expect(
      contentImportSchema.safeParse({
        ...base,
        sections: [sections[0], sections[0]],
      }).success,
    ).toBe(false);
    expect(
      contentImportSchema.safeParse({
        ...base,
        source: { url: "javascript:alert(1)", title: "" },
      }).success,
    ).toBe(false);
    expect(
      contentImportSchema.safeParse({
        ...base,
        sections: [{ ...sections[1], rows: [["short"]] }],
      }).success,
    ).toBe(false);
    expect(
      contentImportSchema.safeParse({
        ...base,
        sections: [{ id: "bad", type: "script", body: "<script>" }],
      }).success,
    ).toBe(false);
  });
});
