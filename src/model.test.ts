import { describe, expect, it } from "vitest";
import {
  createBlock,
  createProject,
  historyReducer,
  moveCard,
  moveItem,
  projectSchema,
  type BoardBlock,
  type History,
} from "./model";

describe("project invariants", () => {
  it("creates three independently editable pages with unique component IDs", () => {
    const project = createProject();
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(Object.keys(project.pages)).toEqual(["webshop", "kanban", "table"]);
    const another = createProject();
    expect(another.pages.webshop[0].id).not.toBe(project.pages.webshop[0].id);
  });
  it("rejects incompatible versions, missing pages, and unsafe theme values", () => {
    const project = createProject();
    expect(projectSchema.safeParse({ ...project, version: 2 }).success).toBe(
      false,
    );
    expect(
      projectSchema.safeParse({ ...project, pages: { webshop: [] } }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        theme: { preset: "custom", radius: 900, font: "url(...)" },
      }).success,
    ).toBe(false);
  });
  it("rejects nonrectangular tables and duplicate nested IDs", () => {
    const project = createProject();
    const table = project.pages.table[0];
    if (table.type !== "table") throw new Error("Expected table");
    table.rows[0].pop();
    expect(projectSchema.safeParse(project).success).toBe(false);
    const duplicate = createProject();
    const board = duplicate.pages.kanban[0] as BoardBlock;
    board.columns[1].cards[0].id = board.columns[0].cards[0].id;
    expect(projectSchema.safeParse(duplicate).success).toBe(false);
  });
  it("rejects oversized content, excessive sections, and invalid IDs", () => {
    const project = createProject();
    project.brand = "a".repeat(41);
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.brand = "still.";
    project.pages.webshop = Array.from({ length: 25 }, () =>
      createBlock("text"),
    );
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.pages.webshop = [createBlock("text")];
    project.pages.webshop[0].id = '"bad-selector';
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
});

describe("rearranging", () => {
  it("reorders blocks without modifying the original and ignores out of bounds moves", () => {
    const items = ["hero", "products", "quote"];
    expect(moveItem(items, 0, 2)).toEqual(["products", "quote", "hero"]);
    expect(items).toEqual(["hero", "products", "quote"]);
    expect(moveItem(items, -1, 2)).toBe(items);
    expect(moveItem(items, 0, 3)).toBe(items);
  });
  it("moves cards into an empty column without duplication or loss", () => {
    const board = createBlock("board") as BoardBlock;
    const source = board.columns[0];
    const card = source.cards[0];
    board.columns[2].cards = [];
    const moved = moveCard(board, card.id, board.columns[2].id);
    expect(moved.columns[0].cards).toHaveLength(source.cards.length - 1);
    expect(moved.columns[2].cards).toEqual([card]);
    expect(board.columns[0].cards[0]).toEqual(card);
    expect(
      projectSchema.safeParse({
        ...createProject(),
        pages: { ...createProject().pages, kanban: [moved] },
      }).success,
    ).toBe(true);
  });
  it("reorders cards in both directions within one column", () => {
    const board = createBlock("board") as BoardBlock;
    const column = board.columns[0];
    const [first, second, third] = column.cards;
    const moved = moveCard(board, first.id, column.id, third.id);
    expect(moved.columns[0].cards.map((card) => card.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);
    expect(
      moveCard(moved, first.id, column.id, second.id).columns[0].cards.map(
        (card) => card.id,
      ),
    ).toEqual([first.id, second.id, third.id]);
  });
  it("inserts before a card in another column and ignores unknown destinations", () => {
    const board = createBlock("board") as BoardBlock;
    const card = board.columns[0].cards[0];
    const destination = board.columns[1];
    expect(
      moveCard(board, card.id, destination.id, destination.cards[0].id)
        .columns[1].cards[0],
    ).toEqual(card);
    expect(moveCard(board, card.id, "missing")).toBe(board);
    expect(moveCard(board, "missing", destination.id)).toBe(board);
    expect(moveCard(board, card.id, destination.id, card.id)).toBe(board);
  });
});

describe("history", () => {
  const start = (): History => ({
    past: [],
    present: createProject(),
    future: [],
  });
  it("restores the entire shared theme and all pages through undo and redo", () => {
    const initial = start();
    const changed = structuredClone(initial.present);
    changed.brand = "Company";
    changed.theme.preset = "tide";
    changed.pages.table.push(createBlock("quote"));
    const edited = historyReducer(initial, {
      type: "change",
      project: changed,
    });
    const undone = historyReducer(edited, { type: "undo" });
    expect(undone.present).toEqual(initial.present);
    expect(historyReducer(undone, { type: "redo" }).present).toEqual(changed);
  });
  it("discards the redo branch after a new edit and ignores unchanged edits", () => {
    const initial = start();
    expect(
      historyReducer(initial, {
        type: "change",
        project: structuredClone(initial.present),
      }),
    ).toBe(initial);
    const edited = historyReducer(initial, {
      type: "change",
      project: { ...initial.present, brand: "First" },
    });
    const undone = historyReducer(edited, { type: "undo" });
    const branched = historyReducer(undone, {
      type: "change",
      project: { ...initial.present, brand: "Second" },
    });
    expect(branched.future).toEqual([]);
    expect(historyReducer(branched, { type: "redo" })).toBe(branched);
  });
  it("caps history at 50 changes", () => {
    let state = start();
    for (let i = 0; i < 75; i++)
      state = historyReducer(state, {
        type: "change",
        project: { ...state.present, name: `Project ${i}` },
      });
    expect(state.past).toHaveLength(50);
  });
});
