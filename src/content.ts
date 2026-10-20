import { z } from "zod";
import {
  textBlockSchema,
  tableBlockSchema,
  uid,
  type Project,
  type PageId,
} from "./model.ts";
import { sourceSchema } from "./theme.ts";

const contentFields = {
  markdown: z.string().min(1).max(100_000),
  sections: z
    .array(z.discriminatedUnion("type", [textBlockSchema, tableBlockSchema]))
    .min(1)
    .max(20),
  notes: z.array(z.string().max(300)).max(12),
};
const reviewFields = z.object(contentFields).superRefine((result, ctx) => {
  const ids = new Set<string>();
  for (const section of result.sections) {
    if (ids.has(section.id))
      ctx.addIssue({ code: "custom", message: "Duplicate section ID" });
    ids.add(section.id);
    if (
      section.type === "table" &&
      section.rows.some((row) => row.length !== section.headers.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Table rows must match the headers",
      });
  }
});
export const contentImportSchema = reviewFields.safeExtend({
  source: sourceSchema.pick({ url: true, title: true }),
  scope: z.enum(["main", "article", "body"]),
});
export const markdownImportSchema = reviewFields.safeExtend({
  source: z.object({ title: z.string().max(120) }),
  scope: z.literal("markdown"),
});
export type ContentImportResult = z.infer<typeof contentImportSchema>;
export type MarkdownImportResult = z.infer<typeof markdownImportSchema>;
export type ContentReview = ContentImportResult | MarkdownImportResult;
export type ContentSection = ContentImportResult["sections"][number];

export function appendImportedSections(
  project: Project,
  page: PageId,
  sections: ContentSection[],
  after: string | null,
): Project {
  if (!sections.length || project.pages[page].length + sections.length > 24)
    throw new Error("Choose sections that fit the page’s 24-section limit.");
  const next = structuredClone(project);
  const selected = next.pages[page].findIndex(
    (section) => section.id === after,
  );
  const position = selected < 0 ? next.pages[page].length : selected + 1;
  next.pages[page].splice(
    position,
    0,
    ...sections.map((section) => ({ ...structuredClone(section), id: uid() })),
  );
  return next;
}
