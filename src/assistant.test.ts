import { describe, expect, it } from "vitest";
import {
  applyReviewedProposal,
  assistantContext,
  contextProject,
  encodeAssistantRequest,
  exampleProposal,
  reviewProposal,
} from "./assistant";
import {
  createBlock,
  createProject,
  historyReducer,
  type Project,
} from "./model";

const plan = (operations: unknown[]) => ({
  summary: "A direction worth exploring.",
  operations,
});
describe("reviewed assistant edits", () => {
  it("shares only chosen sections and bounded brand settings, without other templates, versions or source provenance", () => {
    const project = createProject();
    project.pages.blog[0] = {
      id: createBlock("text").id,
      type: "text",
      title: "Private journal",
      body: "Private journal content",
    };
    project.theme.custom = {
      accent: "#123456",
      surface: "#ffffff",
      ink: "#111111",
      soft: "#eeeeee",
      source: {
        url: "https://private.example.com",
        title: "Private source",
        fontName: "Secret font",
      },
    };
    const context = assistantContext(
      project,
      "webshop",
      project.pages.webshop[0].id,
    );
    const encoded = encodeAssistantRequest({
      prompt: "Shorten this heading",
      context,
    });
    expect(context.blocks).toHaveLength(1);
    expect(context.blocks[0]).toEqual(project.pages.webshop[0]);
    expect(encoded).not.toMatch(
      /Private journal|private\.example|Secret font|versions/,
    );
    expect(context.theme.imported).toBe(true);
    expect(contextProject(context).pages.webshop).toEqual(context.blocks);
  });
  it("reviews text, new content, and shared branding without mutating the draft, then applies as one undoable change", () => {
    const project = createProject();
    const before = structuredClone(project);
    const review = reviewProposal(
      project,
      "webshop",
      plan([
        {
          type: "edit_text",
          blockId: project.pages.webshop[0].id,
          field: "title",
          value: "A warm welcome",
        },
        { type: "set_brand", value: "Fieldwork" },
        {
          type: "add_text",
          afterBlockId: null,
          title: "Next step",
          body: "Hear from the team",
          appearance: "article",
        },
      ]),
    );
    expect(project).toEqual(before);
    expect(review.changes).toHaveLength(3);
    expect(review.changes[1].label).toMatch(/all six/);
    const next = applyReviewedProposal(project, review);
    expect(next.pages.webshop[0]).toHaveProperty("title", "A warm welcome");
    expect(next.pages.webshop.at(-1)).toMatchObject({
      title: "Next step",
      appearance: "article",
    });
    expect(next.pages.blog).toEqual(project.pages.blog);
    const changed = historyReducer(
      { past: [], present: project, future: [] },
      { type: "change", project: next },
    );
    expect(changed.past).toHaveLength(1);
    expect(historyReducer(changed, { type: "undo" }).present).toEqual(project);
    expect(
      historyReducer(historyReducer(changed, { type: "undo" }), {
        type: "redo",
      }).present,
    ).toEqual(next);
  });
  it("preserves stable existing IDs and gives added sections fresh IDs", () => {
    const project = createProject();
    const operations = plan([
      {
        type: "add_text",
        afterBlockId: project.pages.webshop[0].id,
        title: "A",
        body: "B",
        appearance: "plain",
      },
    ]);
    const first = reviewProposal(project, "webshop", operations);
    const second = reviewProposal(project, "webshop", operations);
    expect(first.next.pages.webshop[0].id).toBe(project.pages.webshop[0].id);
    expect(first.next.pages.webshop[1].id).not.toBe(
      second.next.pages.webshop[1].id,
    );
    expect(first.next.pages.webshop[2]).toEqual(project.pages.webshop[1]);
  });
  it("replaces imported palettes only through an explicitly reviewed global theme change", () => {
    const project = createProject();
    project.theme.custom = {
      accent: "#123456",
      surface: "#ffffff",
      ink: "#111111",
      soft: "#eeeeee",
      source: {
        url: "https://example.com",
        title: "Brand",
        fontName: "Custom",
      },
    };
    const review = reviewProposal(
      project,
      "blog",
      plan([{ type: "set_theme", preset: "tide", font: "sans", radius: 18 }]),
    );
    expect(review.changes[0]).toMatchObject({
      label: "Theme · all six templates",
      before: expect.stringContaining("Imported palette"),
      after: expect.stringContaining("Tide"),
    });
    expect(review.next.theme.custom).toBeUndefined();
    expect(project.theme.custom).toBeDefined();
  });
  it("edits table cells and headers and appends rectangular rows atomically", () => {
    const project = createProject();
    const table = project.pages.table.find((block) => block.type === "table")!;
    const review = reviewProposal(
      project,
      "table",
      plan([
        {
          type: "table_header",
          blockId: table.id,
          column: 0,
          value: "Customer",
        },
        {
          type: "table_cell",
          blockId: table.id,
          row: 0,
          column: 0,
          value: "Alex Example",
        },
        {
          type: "add_table_row",
          blockId: table.id,
          cells: table.headers.map((_, index) => `New ${index}`),
        },
      ]),
    );
    const next = review.next.pages.table.find(
      (block) => block.type === "table",
    )!;
    expect(next.headers[0]).toBe("Customer");
    expect(next.rows[0][0]).toBe("Alex Example");
    expect(next.rows).toHaveLength(table.rows.length + 1);
    expect(table.headers[0]).not.toBe("Customer");
  });
  it("reorders and removes sections without affecting another template", () => {
    const project = createProject();
    const [a, b, c] = project.pages.webshop;
    const review = reviewProposal(
      project,
      "webshop",
      plan([
        { type: "move_section", blockId: c.id, beforeBlockId: a.id },
        { type: "remove_section", blockId: b.id },
      ]),
    );
    expect(review.next.pages.webshop.map((block) => block.id)).toEqual([
      c.id,
      a.id,
    ]);
    expect(review.next.pages.table).toEqual(project.pages.table);
  });
  it("rejects unknown operations, arbitrary paths, extra properties and oversized text", () => {
    const project = createProject();
    for (const operation of [
      { type: "execute", code: "alert(1)" },
      {
        type: "edit_text",
        blockId: project.pages.webshop[0].id,
        field: "__proto__",
        value: "polluted",
      },
      { type: "set_brand", value: "Hello", extra: true },
      {
        type: "edit_text",
        blockId: project.pages.webshop[0].id,
        field: "title",
        value: "x".repeat(2001),
      },
    ])
      expect(() =>
        reviewProposal(project, "webshop", plan([operation])),
      ).toThrow(/unsupported proposal/);
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan(Array(13).fill({ type: "set_brand", value: "A" })),
      ),
    ).toThrow();
  });
  it("distinguishes same-titled sections in order reviews and shows removed content", () => {
    const project = createProject();
    project.pages.webshop = [
      { id: "one", type: "text", title: "Same heading", body: "First content" },
      {
        id: "two",
        type: "text",
        title: "Same heading",
        body: "Second content",
      },
    ];
    const moved = reviewProposal(
      project,
      "webshop",
      plan([{ type: "move_section", blockId: "two", beforeBlockId: "one" }]),
    );
    expect(moved.changes).toHaveLength(1);
    expect(moved.changes[0].before).not.toBe(moved.changes[0].after);
    expect(moved.next.pages.webshop[0].id).toBe("two");
    const removed = reviewProposal(
      project,
      "webshop",
      plan([{ type: "remove_section", blockId: "two" }]),
    );
    expect(removed.changes[0].before).toContain("Second content");
  });
  it("refuses missing, wrong-type, cross-template and undisclosed-section references", () => {
    const project = createProject();
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([
          { type: "edit_text", blockId: "missing", field: "title", value: "X" },
        ]),
      ),
    ).toThrow(/missing section/);
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([
          {
            type: "edit_text",
            blockId: project.pages.webshop[0].id,
            field: "body",
            value: "X",
          },
        ]),
      ),
    ).toThrow(/cannot edit/);
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([{ type: "remove_section", blockId: project.pages.blog[0].id }]),
      ),
    ).toThrow(/missing section/);
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([
          { type: "remove_section", blockId: project.pages.webshop[1].id },
        ]),
        new Set([project.pages.webshop[0].id]),
      ),
    ).toThrow(/outside the shared context/);
  });
  it("never leaves a partial draft after a later operation fails", () => {
    const project = createProject();
    const before = structuredClone(project);
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([
          { type: "set_brand", value: "Should not be applied" },
          { type: "remove_section", blockId: "missing" },
        ]),
      ),
    ).toThrow();
    expect(project).toEqual(before);
  });
  it("enforces section and table capacity, existing cell indexes, and the last-section rule", () => {
    const project = createProject();
    project.pages.webshop = [project.pages.webshop[0]];
    expect(() =>
      reviewProposal(
        project,
        "webshop",
        plan([
          { type: "remove_section", blockId: project.pages.webshop[0].id },
        ]),
      ),
    ).toThrow(/at least one/);
    project.pages.webshop = Array.from({ length: 24 }, () =>
      createBlock("text"),
    );
    expect(() =>
      reviewProposal(project, "webshop", exampleProposal(project, "webshop")),
    ).toThrow(/24 sections/);
    const table = project.pages.table.find((block) => block.type === "table")!;
    for (const op of [
      { type: "table_cell", blockId: table.id, row: 99, column: 0, value: "X" },
      { type: "table_header", blockId: table.id, column: 19, value: "X" },
      { type: "add_table_row", blockId: table.id, cells: ["Wrong shape"] },
      {
        type: "table_header",
        blockId:
          project.pages.table[1].id === table.id
            ? project.pages.webshop[0].id
            : project.pages.table[1].id,
        column: 0,
        value: "X",
      },
    ])
      expect(() => reviewProposal(project, "table", plan([op]))).toThrow();
    table.rows = Array.from({ length: 100 }, () => [...table.headers]);
    expect(() =>
      reviewProposal(
        project,
        "table",
        plan([
          { type: "add_table_row", blockId: table.id, cells: table.headers },
        ]),
      ),
    ).toThrow(/does not fit/);
  });
  it("rejects stale reviews after content, branding, or another template changes", () => {
    const project = createProject();
    const review = reviewProposal(
      project,
      "webshop",
      exampleProposal(project, "webshop"),
    );
    expect(() =>
      applyReviewedProposal({ ...project, name: "Different project" }, review),
    ).toThrow(/changed after/);
    const changed = structuredClone(project);
    changed.pages.blog.push(createBlock("text"));
    expect(() => applyReviewedProposal(changed, review)).toThrow(
      /changed after/,
    );
  });
  it("supports advice-only and unchanged proposals without making fake changes", () => {
    const project = createProject();
    expect(reviewProposal(project, "webshop", plan([])).changes).toEqual([]);
    expect(
      reviewProposal(
        project,
        "webshop",
        plan([{ type: "set_brand", value: project.brand }]),
      ).changes,
    ).toEqual([]);
  });
  it("rejects excessive context bytes and final project size with Unicode-aware limits", () => {
    const project = createProject();
    project.pages.webshop = Array.from({ length: 24 }, () => ({
      ...createBlock("text"),
      title: "界".repeat(2000),
      body: "界".repeat(2000),
    }));
    expect(() =>
      encodeAssistantRequest({
        prompt: "Improve it",
        context: assistantContext(project, "webshop"),
      }),
    ).toThrow(/too large/);
    expect(
      encodeAssistantRequest({
        prompt: "Improve it",
        context: assistantContext(
          project,
          "webshop",
          project.pages.webshop[0].id,
        ),
      }).length,
    ).toBeLessThan(65_000);
    const large: Project = createProject();
    const table = large.pages.table.find((block) => block.type === "table")!;
    table.rows = Array.from({ length: 100 }, () =>
      table.headers.map(() => "x".repeat(2000)),
    );
    expect(() =>
      reviewProposal(large, "webshop", exampleProposal(large, "webshop")),
    ).toThrow(/too large/);
  });
});
