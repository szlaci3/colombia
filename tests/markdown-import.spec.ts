import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { markdownExample } from "../src/markdown-example";
import { createBlock, createProject } from "../src/model";

async function openPaste(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start from a website", exact: true })
    .click();
  await page.getByRole("button", { name: "Page content", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste Markdown", exact: true })
    .click();
}
async function prepare(page: Page, source = markdownExample) {
  await page
    .getByRole("textbox", { name: "Your Markdown", exact: true })
    .fill(source);
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await expect(page.getByLabel("Find sections", { exact: true })).toBeVisible();
}

test("imports local Markdown without API/media requests and retains editing, saving, undo and redo", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/tracking-pixel.png", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await openPaste(page);
  await page.getByLabel("Markdown title (optional)").fill("Monday planning");
  await prepare(
    page,
    "# Our meeting\n\nA **clearer** welcome. ![Example](https://images.example/tracking-pixel.png)\n\n| Idea | Owner |\n|---|---|\n| Explore | Alex |",
  );
  await expect(
    page.getByRole("heading", { name: "Monday planning", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".style-source a")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add 2 sections to Webshop", exact: true })
    .click();
  await expect(page.locator("[data-block-type]")).toHaveCount(5);
  await expect(
    page.getByRole("textbox", { name: "Section body", exact: true }),
  ).toHaveText("A clearer welcome. Example");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const cell = page.getByRole("textbox", { name: "Row 1, Owner", exact: true });
  await cell.fill("Casey");
  await cell.press("Tab");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(cell).toHaveText("Casey");
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "grove",
  );
  expect(requests).toEqual([]);
});

test("keeps hidden selections within capacity and adds them in source order after searching and previewing", async ({
  page,
}) => {
  const project = createProject();
  project.pages.webshop.push(
    ...Array.from({ length: 19 }, () => createBlock("text")),
  );
  await page.addInitScript(
    (project) =>
      localStorage.setItem("formlane.project.v1", JSON.stringify(project)),
    project,
  );
  await openPaste(page);
  await page
    .getByRole("button", { name: "Use the meeting notes example" })
    .click();
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  const tableChoice = page.getByRole("checkbox", {
    name: "Include section 3: Our next steps",
    exact: true,
  });
  await expect(tableChoice).toBeDisabled();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await tableChoice.check();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.locator(".selection-summary")).toContainText(
    "1 selected outside this filter",
  );
  await page
    .getByRole("button", { name: "Select matching", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add 2 sections to Webshop",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", {
      name: "Include section 2: Questions to bring",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Find sections", { exact: true }).fill("not a match");
  await expect(page.getByText(/No matching sections/)).toBeVisible();
  await expect(page.locator(".selection-summary")).toContainText(
    "2 selected outside this filter",
  );
  await page.getByLabel("Find sections", { exact: true }).fill("Sam");
  await page.getByRole("button", { name: "All sections", exact: true }).click();
  await expect(tableChoice).toBeChecked();
  await page
    .getByRole("button", {
      name: "Preview section 3: Our next steps",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Preview table: Our next steps",
      exact: true,
    }),
  ).toContainText("Sam");
  await page
    .getByRole("button", { name: "Add 2 sections to Webshop", exact: true })
    .click();
  await expect(page.locator("[data-block-type]")).toHaveCount(24);
  await expect(page.locator("[data-block-type]").nth(22)).toHaveAttribute(
    "data-block-type",
    "text",
  );
  await expect(page.locator("[data-block-type]").nth(23)).toHaveAttribute(
    "data-block-type",
    "table",
  );
});

test("downloads the complete original Markdown regardless of filters and preserves it when changing input sources", async ({
  page,
}) => {
  await openPaste(page);
  await prepare(page);
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Markdown", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("a-clearer-welcome.md");
  expect(readFileSync((await download.path())!, "utf8")).toBe(markdownExample);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Extracted Markdown", exact: true }),
  ).toHaveValue(markdownExample);
  await page.getByRole("button", { name: "Website URL", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Add .*sections? to Webshop/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Paste Markdown", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your Markdown", exact: true }),
  ).toHaveValue(markdownExample);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
});

test("rejects oversized and raw-HTML-only input and invalidates a review when its source is edited", async ({
  page,
}) => {
  await openPaste(page);
  const field = page.getByRole("textbox", {
    name: "Your Markdown",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "Prepare sections", exact: true }),
  ).toBeDisabled();
  await field.fill("x".repeat(100_001));
  await expect(page.getByRole("alert")).toContainText("100,000");
  await expect(
    page.getByRole("button", { name: "Prepare sections", exact: true }),
  ).toBeDisabled();
  await field.fill("<script>window.pastedExecuted=true</script>");
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("No editable text");
  expect(await page.evaluate(() => "pastedExecuted" in window)).toBe(false);
  await prepare(page, "# First\n\nSome content");
  await field.fill("# Revised\n\nDifferent content");
  await expect(
    page.getByRole("button", { name: "Add 1 section to Webshop", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revised", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(3);
});

test("ignores a late website response after switching to pasted Markdown", async ({
  page,
}) => {
  await page.route("**/api/import-content", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route
      .fulfill({
        json: {
          source: { url: "https://example.com", title: "Late page" },
          scope: "body",
          markdown: "Late",
          sections: [
            { id: "late", type: "text", title: "Late page", body: "Late" },
          ],
          notes: [],
        },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start from a website", exact: true })
    .click();
  await page.getByRole("button", { name: "Page content", exact: true }).click();
  await page
    .getByLabel("Content website URL", { exact: true })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Read page", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste Markdown", exact: true })
    .click();
  await prepare(page, "# Local notes\n\nKeep this review.");
  await expect(
    page.getByRole("heading", { name: "Local notes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add 1 section to Webshop", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section title", exact: true }),
  ).toHaveText("Local notes");
  await expect(page.getByText("Late page", { exact: true })).toHaveCount(0);
});

test("provides inert full previews and accessible filters on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPaste(page);
  const source =
    "# Notes\n\n" +
    "A little more room. ".repeat(15) +
    'End of the full section.\n\n`<img src=x onerror="window.pastedExecuted=true">`';
  await prepare(page, source);
  await page
    .getByRole("button", { name: "Preview section 1: Notes", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Full preview: Notes",
    exact: true,
  });
  await expect(preview).toContainText("End of the full section.");
  await expect(preview).toContainText(
    '<img src=x onerror="window.pastedExecuted=true">',
  );
  await expect(preview.locator("img,script")).toHaveCount(0);
  expect(await page.evaluate(() => "pastedExecuted" in window)).toBe(false);
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
  await page.screenshot({ path: "test-results/formlane-markdown-phone.png" });
});
