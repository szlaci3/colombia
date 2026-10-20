import { describe, expect, it } from "vitest";
import { createProject, projectSchema } from "./model";
import { contrast, paletteProblems, readablePalette } from "./theme";
import { makeShareUrl, loadProject } from "./storage";

describe("imported theme compatibility", () => {
  it("keeps existing projects valid and preserves custom colors in files and snapshots", () => {
    const project = createProject();
    expect(projectSchema.safeParse(project).success).toBe(true);
    project.theme.custom = {
      ...readablePalette("#e088ee", "#eeeeee", "#111111").palette,
      source: {
        url: "https://example.com/",
        title: "Example",
        fontName: "Inter",
      },
    };
    expect(projectSchema.parse(project).theme.custom).toEqual(
      project.theme.custom,
    );
    const hash = new URL(makeShareUrl(project, "https://formlane.example/"))
      .hash;
    expect(loadProject({ getItem: () => null }, hash).project).toEqual(project);
  });
  it("rejects executable CSS and unsafe source links in imported project files", () => {
    const project = createProject();
    const custom = {
      accent: "url(javascript:alert(1))",
      surface: "#ffffff",
      ink: "#222222",
      soft: "#eeeeee",
      source: { url: "javascript:alert(1)", title: "", fontName: "" },
    };
    expect(
      projectSchema.safeParse({
        ...project,
        theme: { ...project.theme, custom },
      }).success,
    ).toBe(false);
  });
  it("requires readable palette combinations and adapts bright accents", () => {
    const result = readablePalette("#ffff00", "#000000", "#ffffff");
    expect(paletteProblems(result.palette)).toEqual([]);
    expect(contrast(result.palette.accent, "#ffffff")).toBeGreaterThanOrEqual(
      5.5,
    );
    expect(
      paletteProblems({
        accent: "#ffffff",
        surface: "#ffffff",
        ink: "#ffffff",
        soft: "#ffffff",
      }).length,
    ).toBeGreaterThan(0);
  });
});
