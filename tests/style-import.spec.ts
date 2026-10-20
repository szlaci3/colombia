import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { extractStyle } from "../server/extract-style";

const brandUrl = "https://formlane.netlify.app/examples/brand-study.html";
const brandResult = extractStyle(
  readFileSync(
    new URL("../public/examples/brand-study.html", import.meta.url),
    "utf8",
  ),
  brandUrl,
  [
    {
      url: "https://formlane.netlify.app/examples/brand-study.css",
      css: readFileSync(
        new URL("../public/examples/brand-study.css", import.meta.url),
        "utf8",
      ),
    },
  ],
);

const result = {
  palette: {
    accent: "#663399",
    surface: "#ffffff",
    ink: "#222222",
    soft: "#f4eff9",
  },
  source: {
    url: "https://example.com/",
    title: "Northstar Studio",
    fontName: "Georgia",
  },
  font: "serif",
  radius: 12,
  colors: ["#663399", "#ffffff", "#222222"],
  stylesheetCount: 1,
  notes: ["Found colors in public CSS.", "A local serif fallback is used."],
};
async function openImport(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import website style", exact: true })
    .click();
  await page
    .getByLabel("Website URL", { exact: true })
    .fill("https://example.com");
}

test("reviews and edits a detected palette before applying it to every page, with undo and persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route("**/api/import-style", (route) =>
    route.fulfill({ json: result }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northstar Studio", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
  const checks = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    checks.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page
    .getByRole("checkbox", { name: "Also change the brand name" })
    .check();
  await page
    .getByRole("textbox", { name: "Imported brand name" })
    .fill("Northstar");
  await page.getByLabel("Imported heading style").selectOption("sans");
  await page.screenshot({ path: "test-results/formlane-style-import.png" });
  await page.getByRole("button", { name: "Apply to all templates" }).click();
  for (const template of [
    "Kanban board",
    "Data table",
    "Blog",
    "Social feed",
    "Dashboard",
    "Webshop",
  ]) {
    await page
      .getByRole("navigation", { name: "Templates" })
      .getByRole("button", { name: template, exact: true })
      .click();
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-theme",
      "custom",
    );
    await expect(
      page.getByRole("textbox", { name: "Canvas brand name" }),
    ).toHaveText("Northstar");
    expect(
      await page
        .locator(".prototype-canvas")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--brand-accent").trim(),
        ),
    ).toBe("#663399");
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name" }),
  ).toHaveText("still.");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "custom",
  );
  await page.getByRole("button", { name: "Tide theme" }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "tide",
  );
});

test("does not alter the project when an import fails, is cancelled, or review is closed", async ({
  page,
}) => {
  await page.route("**/api/import-style", (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: "This site blocks automated requests. Try another public page.",
      },
    }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "blocks automated requests",
  );
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
  await page.unroute("**/api/import-style");
  await page.route("**/api/import-style", (route) =>
    route.fulfill({ json: result }),
  );
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northstar Studio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
});

test("prevents applying unreadable review colors and supports phone layouts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/import-style", (route) =>
    route.fulfill({ json: result }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northstar Studio", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Accent color", { exact: true }).fill("#ffffff");
  await expect(
    page.getByRole("button", { name: "Apply to all templates" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "accent needs more contrast",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const checks = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    checks.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
});

test("the real local endpoint rejects an unsafe URL without fetching it", async ({
  request,
}) => {
  const response = await request.post("/api/import-style", {
    data: { url: "https://127.0.0.1/latest/meta-data" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/public website/);
});

test("cancels an in-flight analysis without applying a late response", async ({
  page,
}) => {
  await page.route("**/api/import-style", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: result }).catch(() => {});
  });
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(page.getByText("Finding the familiar details.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explore style", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Apply to all templates" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
});

test("matches browser styling on the original brand example and reviews source evidence without mutating it", async ({
  page,
}) => {
  await page.goto("/examples/brand-study.html");
  // Real Chromium computed values provide an independent oracle for this static fixture.
  const actual = await page.locator("#explore").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      accent: style.backgroundColor,
      radius: style.borderRadius,
      surface: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.querySelector("h1")!).fontFamily,
    };
  });
  expect(actual).toMatchObject({
    accent: "rgb(102, 51, 153)",
    radius: "12px",
    surface: "rgb(255, 255, 255)",
  });
  expect(actual.font).toContain(brandResult.source.fontName);
  await page.route("**/api/import-style", (route) =>
    route.fulfill({ json: brandResult }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Try the brand study example" })
    .click();
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue(
    brandUrl,
  );
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await page.getByText("Where these styles came from", { exact: true }).click();
  const evidence = page.locator(".style-evidence");
  await expect(evidence).toContainText("Detected: #663399");
  await expect(evidence).toContainText("#explore · background");
  await expect(evidence).toContainText("brand-study.css");
  await expect(evidence).toContainText("Detected: Georgia");
  await page
    .getByRole("button", { name: "Use #ffffff as accent", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply to all templates" }),
  ).toBeDisabled();
  await expect(evidence).toContainText("Prototype: #ffffff");
  await expect(evidence).toContainText("Detected: #663399");
  await page
    .getByRole("button", { name: "Use #663399 as accent", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply to all templates" }),
  ).toBeEnabled();
  await page.getByLabel("Imported heading style").selectOption("sans");
  await expect(evidence).toContainText("Prototype: Local sans-serif");
  await expect(evidence).toContainText("Detected: Georgia");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
});

test("renders source evidence as inert text on a phone and keeps it accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const hostile = '<img src=x onerror="window.sourceExecuted=true">';
  await page.route("**/api/import-style", (route) =>
    route.fulfill({
      json: {
        ...brandResult,
        evidence: brandResult.evidence!.map((item, i) =>
          i ? item : { ...item, selector: hostile, source: hostile },
        ),
      },
    }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await page.getByText("Where these styles came from", { exact: true }).click();
  await expect(page.locator(".style-evidence code").first()).toContainText(
    hostile,
  );
  await expect(page.locator(".style-evidence img")).toHaveCount(0);
  expect(await page.evaluate(() => "sourceExecuted" in window)).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const checks = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    checks.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/formlane-style-evidence-phone.png",
  });
});

test("rejects invalid source evidence before changing the project", async ({
  page,
}) => {
  await page.route("**/api/import-style", (route) =>
    route.fulfill({
      json: {
        ...brandResult,
        evidence: [{ ...brandResult.evidence![0], basis: "computed-browser" }],
      },
    }),
  );
  await openImport(page);
  await page
    .getByRole("button", { name: "Explore style", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "unsupported style result",
  );
  await expect(
    page.getByRole("button", { name: "Apply to all templates" }),
  ).toHaveCount(0);
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
});
