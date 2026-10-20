import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const paletteSchema = z.object({
  accent: hex,
  surface: hex,
  ink: hex,
  soft: hex,
});
export type Palette = z.infer<typeof paletteSchema>;
export const sourceSchema = z.object({
  url: z
    .string()
    .url()
    .max(2000)
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }),
  title: z.string().max(120),
  fontName: z.string().max(120),
});
export const customThemeSchema = paletteSchema.extend({ source: sourceSchema });
export const styleEvidenceSchema = z.object({
  role: z.enum(["accent", "surface", "ink", "font", "radius"]),
  selector: z.string().max(200),
  property: z.string().max(80),
  value: z.string().max(200),
  source: z.string().max(160),
  basis: z.enum(["matched", "token", "metadata", "fallback"]),
});
export type StyleEvidence = z.infer<typeof styleEvidenceSchema>;
export const styleImportSchema = z.object({
  palette: paletteSchema,
  font: z.enum(["serif", "sans"]),
  radius: z.number().int().min(0).max(24),
  source: sourceSchema,
  colors: z.array(hex).max(8),
  notes: z.array(z.string().max(300)).max(12),
  stylesheetCount: z.number().int().min(0).max(3),
  evidence: z.array(styleEvidenceSchema).max(5).optional(),
});
export type StyleImport = z.infer<typeof styleImportSchema>;

export function luminance(color: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  return rgb.reduce(
    (sum, channel, i) =>
      sum +
      (channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][i],
    0,
  );
}
export function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
export function mix(a: string, b: string, amount: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - amount) +
            parseInt(b.slice(i, i + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function paletteProblems(palette: Palette): string[] {
  const problems: string[] = [];
  if (luminance(palette.surface) < 0.65 || luminance(palette.soft) < 0.6)
    problems.push(
      "Choose light page and soft backgrounds for these templates.",
    );
  if (
    contrast(palette.ink, palette.surface) < 7 ||
    contrast(palette.ink, palette.soft) < 7 ||
    contrast(palette.ink, "#ffffff") < 7
  )
    problems.push("Text needs more contrast with the backgrounds.");
  if (
    contrast(palette.accent, palette.surface) < 5.5 ||
    contrast(palette.accent, palette.soft) < 5.5 ||
    contrast(palette.accent, "#ffffff") < 5.5
  )
    problems.push(
      "The accent needs more contrast for buttons and small labels.",
    );
  return problems;
}

export function readablePalette(
  accent: string,
  surface: string,
  ink: string,
): { palette: Palette; notes: string[] } {
  const notes: string[] = [];
  if (luminance(surface) < 0.65) {
    surface = "#fafaf7";
    notes.push(
      "A light page background replaces the dark source background to fit these templates.",
    );
  }
  const original = accent;
  let soft = mix(accent, "#ffffff", 0.94);
  for (
    let step = 0;
    step < 24 &&
    [surface, soft, "#ffffff"].some((bg) => contrast(accent, bg) < 5.5);
    step++
  ) {
    accent = mix(accent, "#000000", 0.1);
    soft = mix(accent, "#ffffff", 0.94);
  }
  if (accent !== original)
    notes.push(
      "The accent was darkened for readable buttons and labels. The original appears in the detected colors.",
    );
  if ([surface, soft, "#ffffff"].some((bg) => contrast(ink, bg) < 7)) {
    ink = "#252b24";
    notes.push("A dark text color was chosen for readability.");
  }
  notes.push("The soft background is a light tint derived from the accent.");
  return { palette: { accent, surface, ink, soft }, notes };
}
