import { z } from "zod";
import { customThemeSchema } from "./theme";

const text = z.string().max(2000);
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const pageIds = ["webshop", "kanban", "table"] as const;
export type PageId = (typeof pageIds)[number];
export const themeIds = ["grove", "atelier", "tide", "mono"] as const;
export type ThemeId = (typeof themeIds)[number];
export const themePresets = {
  grove: {
    name: "Grove",
    caption: "Natural & considered",
    accent: "#536b48",
    surface: "#f5f5ed",
    ink: "#30382d",
    soft: "#e6ebde",
    font: "serif",
    radius: 12,
  },
  atelier: {
    name: "Atelier",
    caption: "Warm & expressive",
    accent: "#a04735",
    surface: "#fcf3e9",
    ink: "#482e28",
    soft: "#f3dfcf",
    font: "serif",
    radius: 4,
  },
  tide: {
    name: "Tide",
    caption: "Clear & contemporary",
    accent: "#285b9a",
    surface: "#f0f5fc",
    ink: "#243850",
    soft: "#dce8f8",
    font: "sans",
    radius: 18,
  },
  mono: {
    name: "Mono",
    caption: "Simple & confident",
    accent: "#343434",
    surface: "#f5f5f5",
    ink: "#252525",
    soft: "#e6e6e6",
    font: "sans",
    radius: 0,
  },
} as const;

const productSchema = z.object({
  id,
  name: text,
  category: text,
  price: text,
  art: z.enum(["vase", "lamp", "chair"]),
});
const cardSchema = z.object({ id, title: text, tag: text, person: text });
const columnSchema = z.object({
  id,
  title: text,
  cards: z.array(cardSchema).max(100),
});
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    id,
    type: z.literal("hero"),
    eyebrow: text,
    title: text,
    description: text,
  }),
  z.object({
    id,
    type: z.literal("products"),
    title: text,
    items: z.array(productSchema).min(1).max(24),
  }),
  z.object({
    id,
    type: z.literal("table"),
    title: text,
    headers: z.array(text).min(1).max(20),
    rows: z.array(z.array(text).max(20)).max(100),
  }),
  z.object({
    id,
    type: z.literal("board"),
    title: text,
    columns: z.array(columnSchema).min(1).max(8),
  }),
  z.object({ id, type: z.literal("quote"), quote: text, author: text }),
  z.object({ id, type: z.literal("text"), title: text, body: text }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BoardBlock = Extract<Block, { type: "board" }>;
export type TableBlock = Extract<Block, { type: "table" }>;
export type Card = z.infer<typeof cardSchema>;

export const projectSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(80),
    brand: z.string().min(1).max(40),
    theme: z.object({
      preset: z.enum(themeIds),
      font: z.enum(["serif", "sans"]),
      radius: z.number().int().min(0).max(24),
      custom: customThemeSchema.optional(),
    }),
    pages: z.object({
      webshop: z.array(blockSchema).min(1).max(24),
      kanban: z.array(blockSchema).min(1).max(24),
      table: z.array(blockSchema).min(1).max(24),
    }),
  })
  .superRefine((project, ctx) => {
    const ids = new Set<string>();
    const checkId = (value: string) => {
      if (ids.has(value))
        ctx.addIssue({ code: "custom", message: "Duplicate component ID" });
      ids.add(value);
    };
    for (const blocks of Object.values(project.pages)) {
      for (const block of blocks) {
        checkId(block.id);
        if (
          block.type === "table" &&
          block.rows.some((row) => row.length !== block.headers.length)
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Table rows must match the columns",
          });
        }
        if (block.type === "products")
          block.items.forEach((item) => checkId(item.id));
        if (block.type === "board")
          block.columns.forEach((column) => {
            checkId(column.id);
            column.cards.forEach((card) => checkId(card.id));
          });
      }
    }
  });
export type Project = z.infer<typeof projectSchema>;
export const uid = () => crypto.randomUUID();

export function createBlock(type: BlockType): Block {
  const base = { id: uid() };
  switch (type) {
    case "hero":
      return {
        ...base,
        type,
        eyebrow: "A new perspective",
        title: "Good things start with an idea.",
        description:
          "A little space to imagine what comes next. Click any text to make it your own.",
      };
    case "products":
      return {
        ...base,
        type,
        title: "Thoughtfully made. Everyday loved.",
        items: [
          {
            id: uid(),
            name: "Arc vase",
            category: "Handmade ceramic",
            price: "€48",
            art: "vase",
          },
          {
            id: uid(),
            name: "Mellow lamp",
            category: "A softer kind of light",
            price: "€129",
            art: "lamp",
          },
          {
            id: uid(),
            name: "Sunday chair",
            category: "Solid oak, endless comfort",
            price: "€265",
            art: "chair",
          },
        ],
      };
    case "table":
      return {
        ...base,
        type,
        title: "People behind the possibilities",
        headers: ["Name", "Company", "Email", "Status"],
        rows: [
          ["Alex Morgan", "Studio North", "alex@example.com", "Active"],
          ["Sam Rivera", "Good Things Co.", "sam@example.com", "In progress"],
          ["Jordan Lee", "Common Ground", "jordan@example.com", "Active"],
          ["Taylor Brooks", "Slow Studio", "taylor@example.com", "Pending"],
          ["Robin Chen", "Fieldwork", "robin@example.com", "Active"],
        ],
      };
    case "board":
      return {
        ...base,
        type,
        title: "Small steps. Good progress.",
        columns: [
          {
            id: uid(),
            title: "To explore",
            cards: [
              {
                id: uid(),
                title: "Find our visual direction",
                tag: "Design",
                person: "AM",
              },
              {
                id: uid(),
                title: "Listen to our customers",
                tag: "Research",
                person: "SR",
              },
              {
                id: uid(),
                title: "Collect a little inspiration",
                tag: "Ideas",
                person: "JL",
              },
            ],
          },
          {
            id: uid(),
            title: "Taking shape",
            cards: [
              {
                id: uid(),
                title: "Make the first prototype",
                tag: "Design",
                person: "JL",
              },
              {
                id: uid(),
                title: "Write our brand story",
                tag: "Content",
                person: "AM",
              },
            ],
          },
          {
            id: uid(),
            title: "Ready to share",
            cards: [
              {
                id: uid(),
                title: "Bring everyone together",
                tag: "Team",
                person: "SR",
              },
            ],
          },
        ],
      };
    case "quote":
      return {
        ...base,
        type,
        quote: "Less, but a little more meaningful.",
        author: "Made for the way you live.",
      };
    case "text":
      return {
        ...base,
        type,
        title: "A little more to the story",
        body: "Every great idea deserves a place to grow. Use this space to share your story, describe a feature, or explore something new together.",
      };
  }
}

export function createProject(): Project {
  const hero = createBlock("hero");
  if (hero.type === "hero")
    Object.assign(hero, {
      eyebrow: "Thoughtful objects. Everyday rituals.",
      title: "A slower pace.\nA better space.",
      description:
        "Considered pieces for a home that feels like you. Made with care. Made to stay.",
    });
  return {
    version: 1,
    name: "A little possibility",
    brand: "still.",
    theme: { preset: "grove", font: "serif", radius: 12 },
    pages: {
      webshop: [hero, createBlock("products"), createBlock("quote")],
      kanban: [createBlock("board"), createBlock("text")],
      table: [createBlock("table"), createBlock("text")],
    },
  };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const result = [...items];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}

export function moveCard(
  board: BoardBlock,
  cardId: string,
  targetColumnId: string,
  beforeId?: string,
): BoardBlock {
  const result = structuredClone(board);
  const source = result.columns.find((column) =>
    column.cards.some((card) => card.id === cardId),
  );
  const target = result.columns.find((column) => column.id === targetColumnId);
  if (!source || !target || beforeId === cardId) return board;
  if (source !== target && target.cards.length >= 100) return board;
  if (source === target && beforeId) {
    const from = source.cards.findIndex((card) => card.id === cardId);
    const to = source.cards.findIndex((card) => card.id === beforeId);
    if (to < 0) return board;
    source.cards = moveItem(source.cards, from, to);
    return result;
  }
  const [card] = source.cards.splice(
    source.cards.findIndex((card) => card.id === cardId),
    1,
  );
  const index = target.cards.findIndex((card) => card.id === beforeId);
  target.cards.splice(index < 0 ? target.cards.length : index, 0, card);
  return result;
}

export type History = { past: Project[]; present: Project; future: Project[] };
export type HistoryAction =
  { type: "change"; project: Project } | { type: "undo" } | { type: "redo" };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "change") {
    if (JSON.stringify(action.project) === JSON.stringify(state.present))
      return state;
    return {
      past: [...state.past.slice(-49), state.present],
      present: action.project,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
