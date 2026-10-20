import { z } from "zod";
import {
  blockSchema,
  createProject,
  pageIds,
  textAppearances,
  themeIds,
  themePresets,
  uid,
  type Block,
  type PageId,
  type Project,
} from "./model.ts";
import { parseProject } from "./storage.ts";
import { paletteSchema } from "./theme.ts";

export const MAX_ASSISTANT_REQUEST = 65_000;
const text = z.string().max(2000);
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const operationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("set_brand"),
    value: z.string().trim().min(1).max(40),
  }),
  z.strictObject({
    type: z.literal("set_theme"),
    preset: z.enum(themeIds),
    font: z.enum(["serif", "sans"]),
    radius: z.number().int().min(0).max(24),
  }),
  z.strictObject({
    type: z.literal("edit_text"),
    blockId: id,
    field: z.enum([
      "title",
      "eyebrow",
      "description",
      "body",
      "quote",
      "author",
    ]),
    value: text,
  }),
  z.strictObject({
    type: z.literal("add_text"),
    afterBlockId: id.nullable(),
    title: text,
    body: text,
    appearance: z.enum(textAppearances),
  }),
  z.strictObject({
    type: z.literal("move_section"),
    blockId: id,
    beforeBlockId: id.nullable(),
  }),
  z.strictObject({ type: z.literal("remove_section"), blockId: id }),
  z.strictObject({
    type: z.literal("table_cell"),
    blockId: id,
    row: z.number().int().min(0).max(99),
    column: z.number().int().min(0).max(19),
    value: text,
  }),
  z.strictObject({
    type: z.literal("table_header"),
    blockId: id,
    column: z.number().int().min(0).max(19),
    value: text,
  }),
  z.strictObject({
    type: z.literal("add_table_row"),
    blockId: id,
    cells: z.array(text).min(1).max(20),
  }),
]);
export const proposalSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1200),
  operations: z.array(operationSchema).max(12),
});
export type Proposal = z.infer<typeof proposalSchema>;
export const contextSchema = z.strictObject({
  name: z.string().min(1).max(80),
  brand: z.string().min(1).max(40),
  page: z.enum(pageIds),
  theme: z.strictObject({
    preset: z.enum(themeIds),
    font: z.enum(["serif", "sans"]),
    radius: z.number().int().min(0).max(24),
    imported: z.boolean(),
    palette: paletteSchema,
  }),
  blocks: z.array(blockSchema).min(1).max(24),
});
export const assistantRequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(2000),
  context: contextSchema,
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type Change = { label: string; before: string; after: string };
export type ReviewedProposal = {
  summary: string;
  changes: Change[];
  base: string;
  next: Project;
  page: PageId;
};

export function assistantContext(
  project: Project,
  page: PageId,
  selectedId: string | null = null,
): AssistantRequest["context"] {
  const palette = project.theme.custom ?? themePresets[project.theme.preset];
  return {
    name: project.name,
    brand: project.brand,
    page,
    theme: {
      preset: project.theme.preset,
      font: project.theme.font,
      radius: project.theme.radius,
      imported: !!project.theme.custom,
      palette: {
        accent: palette.accent,
        surface: palette.surface,
        ink: palette.ink,
        soft: palette.soft,
      },
    },
    blocks: structuredClone(
      selectedId
        ? project.pages[page].filter((block) => block.id === selectedId)
        : project.pages[page],
    ),
  };
}
export function contextProject(context: AssistantRequest["context"]): Project {
  const project = createProject();
  project.name = context.name;
  project.brand = context.brand;
  project.theme = {
    preset: context.theme.preset,
    font: context.theme.font,
    radius: context.theme.radius,
  };
  project.pages[context.page] = context.blocks;
  return parseProject(JSON.stringify(project));
}
export function encodeAssistantRequest(request: AssistantRequest): string {
  const json = JSON.stringify(assistantRequestSchema.parse(request));
  if (new TextEncoder().encode(json).length > MAX_ASSISTANT_REQUEST)
    throw new Error(
      "This template is too large for the assistant. Select one section and use “Selected section” instead.",
    );
  return json;
}
function title(block: Block): string {
  return block.type === "quote"
    ? "Testimonial"
    : block.title || "Untitled section";
}
function sectionText(block: Block): string {
  switch (block.type) {
    case "hero":
      return [block.eyebrow, block.title, block.description].join("\n");
    case "text":
      return [block.title, block.body].join("\n");
    case "quote":
      return [block.quote, block.author].join("\n");
    case "products":
      return [
        block.title,
        ...block.items.map(
          (item) => `${item.name} | ${item.category} | ${item.price}`,
        ),
      ].join("\n");
    case "table":
      return [
        block.title,
        block.headers.join(" | "),
        ...block.rows.map((row) => row.join(" | ")),
      ].join("\n");
    case "board":
      return [
        block.title,
        ...block.columns.flatMap((column) => [
          column.title,
          ...column.cards.map(
            (card) => `${card.title} | ${card.tag} | ${card.person}`,
          ),
        ]),
      ].join("\n");
  }
}
const fieldNames = {
  title: "Heading",
  eyebrow: "Eyebrow",
  description: "Description",
  body: "Body",
  quote: "Quote",
  author: "Author",
};
export function reviewProposal(
  project: Project,
  page: PageId,
  value: unknown,
  allowedIds?: Set<string>,
): ReviewedProposal {
  const parsed = proposalSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "The assistant returned an unsupported proposal. Nothing was changed. Try a simpler request.",
    );
  const next = structuredClone(project);
  const changes: Change[] = [];
  const blocks = next.pages[page];
  const originalPositions = new Map(
    project.pages[page].map((block, index) => [block.id, index + 1]),
  );
  const sectionOrder = () =>
    blocks
      .map(
        (block) =>
          `${originalPositions.get(block.id) ?? "New"}. ${title(block)}`,
      )
      .join("\n");
  const find = (id: string) => {
    if (allowedIds && !allowedIds.has(id))
      throw new Error(
        "That proposal refers to a section outside the shared context. Nothing was changed.",
      );
    const block = blocks.find((block) => block.id === id);
    if (!block)
      throw new Error(
        "That proposal refers to a missing section. Nothing was changed.",
      );
    return block;
  };
  const change = (label: string, before: string, after: string) => {
    if (before !== after) changes.push({ label, before, after });
  };
  for (const operation of parsed.data.operations) {
    switch (operation.type) {
      case "set_brand":
        change("Brand name · all six templates", next.brand, operation.value);
        next.brand = operation.value;
        break;
      case "set_theme": {
        const before = `${next.theme.custom ? "Imported palette" : themePresets[next.theme.preset].name}, ${next.theme.font}, ${next.theme.radius}px corners`;
        const after = `${themePresets[operation.preset].name}, ${operation.font}, ${operation.radius}px corners`;
        change("Theme · all six templates", before, after);
        next.theme = {
          preset: operation.preset,
          font: operation.font,
          radius: operation.radius,
        };
        break;
      }
      case "edit_text": {
        const block = find(operation.blockId);
        const field = operation.field;
        if (
          !Object.hasOwn(block, field) ||
          typeof (block as Record<string, unknown>)[field] !== "string"
        )
          throw new Error(
            "That proposal uses a field this section cannot edit. Nothing was changed.",
          );
        const record = block as unknown as Record<string, string>;
        change(
          `${title(block)} · ${fieldNames[field]}`,
          record[field],
          operation.value,
        );
        record[field] = operation.value;
        break;
      }
      case "add_text": {
        const position =
          operation.afterBlockId === null
            ? blocks.length
            : blocks.indexOf(find(operation.afterBlockId)) + 1;
        if (blocks.length >= 24)
          throw new Error(
            "This page already has 24 sections. Remove one before adding another.",
          );
        blocks.splice(position, 0, {
          id: uid(),
          type: "text",
          title: operation.title,
          body: operation.body,
          appearance: operation.appearance,
        });
        changes.push({
          label: "Add text section",
          before: "No section",
          after: `${operation.title}\n${operation.body}\nStyle: ${operation.appearance}`,
        });
        break;
      }
      case "move_section": {
        const block = find(operation.blockId);
        const before = sectionOrder();
        const anchor =
          operation.beforeBlockId === null
            ? null
            : find(operation.beforeBlockId);
        if (block === anchor) break;
        blocks.splice(blocks.indexOf(block), 1);
        blocks.splice(
          anchor ? blocks.indexOf(anchor) : blocks.length,
          0,
          block,
        );
        change(
          "Section order · numbers identify original positions",
          before,
          sectionOrder(),
        );
        break;
      }
      case "remove_section": {
        const block = find(operation.blockId);
        if (blocks.length === 1)
          throw new Error(
            "Keep at least one section on the page. Nothing was changed.",
          );
        blocks.splice(blocks.indexOf(block), 1);
        changes.push({
          label: "Remove section",
          before: sectionText(block),
          after: "Section removed",
        });
        break;
      }
      case "table_cell":
      case "table_header":
      case "add_table_row": {
        const block = find(operation.blockId);
        if (block.type !== "table")
          throw new Error(
            "That section is not a data table. Nothing was changed.",
          );
        if (operation.type === "add_table_row") {
          if (
            block.rows.length >= 100 ||
            operation.cells.length !== block.headers.length
          )
            throw new Error(
              "That row does not fit this table. Nothing was changed.",
            );
          block.rows.push(operation.cells);
          changes.push({
            label: `${title(block)} · add row`,
            before: "No row",
            after: operation.cells.join(" | "),
          });
        } else {
          if (
            operation.column >= block.headers.length ||
            (operation.type === "table_cell" &&
              operation.row >= block.rows.length)
          )
            throw new Error(
              "That table cell does not exist. Nothing was changed.",
            );
          const cells =
            operation.type === "table_cell"
              ? block.rows[operation.row]
              : block.headers;
          change(
            `${title(block)} · ${operation.type === "table_cell" ? `row ${operation.row + 1}` : "header"}, column ${operation.column + 1}`,
            cells[operation.column],
            operation.value,
          );
          cells[operation.column] = operation.value;
        }
      }
    }
  }
  return {
    summary: parsed.data.summary,
    changes,
    base: JSON.stringify(project),
    next: parseProject(JSON.stringify(next)),
    page,
  };
}

export function applyReviewedProposal(
  current: Project,
  review: ReviewedProposal,
): Project {
  if (JSON.stringify(current) !== review.base)
    throw new Error(
      "Your project changed after this proposal was prepared. Ask again to review the latest draft.",
    );
  return parseProject(JSON.stringify(review.next));
}

export function exampleProposal(project: Project, page: PageId): Proposal {
  const hero = project.pages[page].find((block) => block.type === "hero");
  return {
    summary:
      "Example: a clearer opening and a short meeting note. This is a built-in example, not an AI response.",
    operations: [
      ...(hero
        ? [
            {
              type: "edit_text" as const,
              blockId: hero.id,
              field: "title" as const,
              value: "A little clarity.\nA new possibility.",
            },
          ]
        : []),
      {
        type: "add_text",
        afterBlockId: null,
        title: "A direction to explore",
        body: "What feels right? What would we change?\nCapture the team’s next step here.",
        appearance: "plain",
      },
    ],
  };
}
