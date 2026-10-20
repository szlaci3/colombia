import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { extractContent } from "../server/extract-content";
import { createBlock, createProject } from "../src/model";

const result = extractContent(
  readFileSync(
    new URL("../public/examples/studio-notes.html", import.meta.url),
    "utf8",
  ),
  "https://formlane.netlify.app/examples/studio-notes.html",
);
async function open(page: Page) {
  await page
    .getByRole("button", { name: "Start from a website", exact: true })
    .click();
  await page.getByRole("button", { name: "Page content", exact: true }).click();
  await page
    .getByLabel("Content website URL", { exact: true })
    .fill(result.source.url);
  await page.getByRole("button", { name: "Read page", exact: true }).click();
}

test("reviews selected content, imports text and a table in one undoable step, and keeps both editable after saving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route("**/api/import-content", (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto("/");
  await open(page);
  await expect(
    page.getByRole("heading", { name: result.source.title, exact: true }),
  ).toBeVisible();
  const checks = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    checks.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({ path: "test-results/formlane-content-import.png" });
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  await page.getByLabel("Find sections", { exact: true }).fill("Jordan");
  await page
    .getByRole("button", { name: /Preview section \d+: Meeting plan/ })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Preview table: Meeting plan",
      exact: true,
    }),
  ).toContainText("Jordan");
  await expect(page.locator(".selection-summary")).toContainText(
    "4 selected outside this filter",
  );
  await page.getByLabel("Find sections", { exact: true }).fill("");
  await page.getByRole("button", { name: "All sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add sections to Webshop", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Include section 1: A better Monday meeting",
      exact: true,
    })
    .check();
  const tableIndex = result.sections.findIndex(
    (section) => section.type === "table",
  );
  await page
    .getByRole("checkbox", {
      name: `Include section ${tableIndex + 1}: Meeting plan`,
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Add 2 sections to Webshop", exact: true })
    .click();
  await expect(page.locator("[data-block-type]")).toHaveCount(5);
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(5);
  const title = page.getByRole("textbox", {
    name: "Section title",
    exact: true,
  });
  await title.fill("Our next meeting");
  await title.press("Tab");
  const cell = page.getByRole("textbox", { name: "Row 1, Owner", exact: true });
  await cell.fill("Casey");
  await cell.press("Tab");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(title).toHaveText("Our next meeting");
  await expect(cell).toHaveText("Casey");
});

test("downloads real Markdown and offers manual copying when clipboard access is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Unavailable");
        },
      },
    }),
  );
  await page.route("**/api/import-content", (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto("/");
  await open(page);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Markdown", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(readFileSync((await download.path())!, "utf8")).toBe(result.markdown);
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Extracted Markdown" }),
  ).toHaveValue(result.markdown);
  await expect(
    page.getByText(
      "Clipboard is unavailable. Select and copy the Markdown below.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
});

test("permits Markdown export when the page has no space and prevents overflowing it", async ({
  page,
}) => {
  const project = createProject();
  project.pages.webshop.push(
    ...Array.from({ length: 21 }, () => createBlock("text")),
  );
  await page.addInitScript(
    (project) =>
      localStorage.setItem("formlane.project.v1", JSON.stringify(project)),
    project,
  );
  await page.route("**/api/import-content", (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto("/");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Add sections to Webshop", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/This page already has 24 sections/),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Markdown", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(24);
});

test("keeps project content intact after an error, an invalid response, cancellation, or switching modes", async ({
  page,
}) => {
  await page.route("**/api/import-content", (route) =>
    route.fulfill({
      status: 422,
      json: { error: "No readable content was found." },
    }),
  );
  await page.goto("/");
  await open(page);
  await expect(page.getByRole("alert")).toHaveText(
    "No readable content was found.",
  );
  await page.unroute("**/api/import-content");
  await page.route("**/api/import-content", (route) =>
    route.fulfill({
      json: { ...result, sections: [{ id: "bad", type: "script" }] },
    }),
  );
  await page.getByRole("button", { name: "Read page", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unsupported content");
  await page.unroute("**/api/import-content");
  await page.route("**/api/import-content", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: result }).catch(() => {});
  });
  await page.getByRole("button", { name: "Read page", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read page", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Visual style", exact: true }).click();
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue(
    result.source.url,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
});

test("shows Markdown as inert text and fits a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const untrusted = {
    ...result,
    markdown: "<script>window.compromised=true</script>\n# A heading",
  };
  await page.route("**/api/import-content", (route) =>
    route.fulfill({ json: untrusted }),
  );
  await page.goto("/");
  await open(page);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Extracted Markdown" }),
  ).toHaveValue(untrusted.markdown);
  expect(await page.evaluate(() => "compromised" in window)).toBe(false);
  await expect(page.getByRole("dialog").locator("script,iframe")).toHaveCount(
    0,
  );
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
});
