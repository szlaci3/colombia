import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import legacy from "../tests/fixtures/legacy-v1.formlane.json" with { type: "json" };
import { createProject, pageIds, projectSchema } from "./model";
import {
  loadProject,
  makeShareUrl,
  MAX_PROJECT_SIZE,
  parseProject,
} from "./storage";

describe("six-template project compatibility", () => {
  it("adds the new templates to a three-page v1 file without changing its content, IDs, or brand", () => {
    const result = parseProject(JSON.stringify(legacy));
    expect(result.version).toBe(1);
    expect(result.name).toBe(legacy.name);
    expect(result.brand).toBe(legacy.brand);
    expect(result.theme).toEqual(legacy.theme);
    for (const page of ["webshop", "kanban", "table"] as const)
      expect(result.pages[page]).toEqual(legacy.pages[page]);
    expect(Object.keys(result.pages)).toEqual(pageIds);
    expect(
      result.pages.blog
        .filter((block) => block.type === "text")
        .every(
          (block) => block.type === "text" && block.appearance === "article",
        ),
    ).toBe(true);
    expect(
      result.pages.social
        .filter((block) => block.type === "text")
        .every((block) => block.type === "text" && block.appearance === "post"),
    ).toBe(true);
    expect(
      result.pages.dashboard
        .filter((block) => block.type === "text")
        .every(
          (block) => block.type === "text" && block.appearance === "metric",
        ),
    ).toBe(true);
    expect(projectSchema.safeParse(result).success).toBe(true);
  });
  it("upgrades local storage and old share payloads with snapshot save protection intact", () => {
    const json = JSON.stringify(legacy);
    const storage = { getItem: () => json };
    const local = loadProject(storage, "");
    expect(local.recovered).toBeUndefined();
    expect(local.project.pages.webshop).toEqual(legacy.pages.webshop);
    const snapshot = loadProject(
      storage,
      `#project=${LZString.compressToEncodedURIComponent(json)}`,
    );
    expect(snapshot.shared).toBe(true);
    expect(snapshot.project.pages.table).toEqual(legacy.pages.table);
    expect(snapshot.project.pages.dashboard).toHaveLength(5);
    expect(storage.getItem()).toBe(json);
  });
  it("keeps normalized IDs and edited layouts stable through saving, files, and six-page snapshots", () => {
    const result = parseProject(JSON.stringify(legacy));
    const post = result.pages.social.find((block) => block.type === "text")!;
    if (post.type !== "text") throw new Error("Expected post");
    post.body = "Our own community note 🌱";
    post.appearance = "article";
    const roundtrip = parseProject(JSON.stringify(result));
    expect(roundtrip).toEqual(result);
    const shared = makeShareUrl(
      result,
      "https://formlane.example/?template=social",
    );
    expect(new URL(shared).searchParams.get("template")).toBe("social");
    expect(
      loadProject({ getItem: () => null }, new URL(shared).hash).project,
    ).toEqual(result);
  });
  it("retains supplied new pages when only some additions are missing", () => {
    const result = parseProject(
      JSON.stringify({
        ...legacy,
        pages: {
          ...legacy.pages,
          blog: [
            {
              id: "existing-blog",
              type: "text",
              title: "Our story",
              body: "Keep this too",
              appearance: "post",
            },
          ],
        },
      }),
    );
    expect(result.pages.blog).toEqual([
      {
        id: "existing-blog",
        type: "text",
        title: "Our story",
        body: "Keep this too",
        appearance: "post",
      },
    ]);
    expect(result.pages.social).toHaveLength(4);
  });
  it("rejects corrupt supplied pages and unsupported layouts instead of replacing them with defaults", () => {
    for (const blog of [
      null,
      [],
      [
        {
          id: "bad-layout",
          type: "text",
          title: "Bad",
          body: "",
          appearance: "url(javascript:bad)",
        },
      ],
    ]) {
      expect(() =>
        parseProject(
          JSON.stringify({ ...legacy, pages: { ...legacy.pages, blog } }),
        ),
      ).toThrow(/not a supported/);
    }
    expect(() =>
      parseProject(
        JSON.stringify({ ...legacy, pages: { webshop: legacy.pages.webshop } }),
      ),
    ).toThrow(/not a supported/);
  });
  it("checks IDs across all six pages and creates independent starter blocks", () => {
    const first = createProject();
    const second = createProject();
    expect(projectSchema.safeParse(first).success).toBe(true);
    for (const page of pageIds)
      expect(first.pages[page][0].id).not.toBe(second.pages[page][0].id);
    first.pages.social[0].id = first.pages.blog[0].id;
    expect(projectSchema.safeParse(first).success).toBe(false);
  });
  it("enforces the byte limit after adding defaults and protects an oversized legacy save", () => {
    const value = structuredClone(legacy);
    const rows = Array.from({ length: 100 }, () =>
      Array.from({ length: 20 }, () => "x".repeat(360)),
    );
    value.pages.table[0].headers = Array.from(
      { length: 20 },
      (_, i) => `Column ${i}`,
    );
    value.pages.table[0].rows = rows;
    let remaining =
      MAX_PROJECT_SIZE -
      1 -
      new TextEncoder().encode(JSON.stringify(value)).length;
    for (const row of rows)
      for (let i = 0; i < row.length && remaining > 0; i++) {
        const extra = Math.min(2000 - row[i].length, remaining);
        row[i] += "x".repeat(extra);
        remaining -= extra;
      }
    expect(remaining).toBe(0);
    const json = JSON.stringify(value);
    expect(new TextEncoder().encode(json)).toHaveLength(MAX_PROJECT_SIZE - 1);
    expect(() => parseProject(json)).toThrow(/too large after adding/);
    expect(loadProject({ getItem: () => json }, "").recovered).toBe(true);
  });
});
