import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createProject } from "../src/model";
import { makeShareUrl } from "../src/storage";

async function edit(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
}
async function projects(page: Page) {
  await page
    .getByRole("button", { name: "Projects and saved versions" })
    .click();
}
async function pdf(page: Page) {
  await page.getByRole("button", { name: "Share prototype" }).click();
  await page.getByRole("button", { name: /Take it to the meeting/ }).click();
}

test("creates, duplicates, switches, renames, and reloads independent projects without crossing undo histories", async ({
  page,
}) => {
  await page.goto("/");
  await edit(page, "Project name", "Team workshop");
  await edit(page, "Hero headline", "Keep this pending edit");
  await page.getByLabel("Brand name", { exact: true }).fill("Team brand");
  await projects(page);
  await page.getByLabel("New project name").fill("Alternative direction");
  await page.getByRole("button", { name: "Duplicate current" }).click();
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveText("Alternative direction");
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Keep this pending edit");
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue(
    "Team brand",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await edit(page, "Hero headline", "Try the alternative");
  await projects(page);
  await page
    .getByRole("button", { name: "Open Team workshop", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Keep this pending edit");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await projects(page);
  await page.getByLabel("New project name").fill("Clean start");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByLabel("Brand name", { exact: true })).not.toHaveValue(
    "Team brand",
  );
  await edit(page, "Project name", "Clean start renamed");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveText("Clean start renamed");
  await projects(page);
  await expect(page.locator(".project-list").first().locator("li")).toHaveCount(
    3,
  );
  await page
    .getByRole("button", { name: "Open Alternative direction", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Try the alternative");
});

test("saves named versions across all templates, restores one as an undoable change, and removes versions explicitly", async ({
  page,
}) => {
  await page.goto("/");
  await edit(page, "Hero headline", "Before the review");
  await projects(page);
  await page
    .getByLabel("Version name", { exact: true })
    .fill("Meeting baseline");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restore Meeting baseline" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await edit(page, "Hero headline", "After the review");
  await page.getByLabel("Brand name", { exact: true }).fill("New identity");
  await page
    .getByRole("navigation", { name: "Templates" })
    .getByRole("button", { name: "Blog", exact: true })
    .click();
  await edit(page, "Hero headline", "Changed journal");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await projects(page);
  await page.getByRole("button", { name: "Restore Meeting baseline" }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).not.toHaveText("Changed journal");
  await expect(page.getByLabel("Brand name", { exact: true })).not.toHaveValue(
    "New identity",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Changed journal");
  await expect(page.getByLabel("Brand name", { exact: true })).toHaveValue(
    "New identity",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Templates" })
    .getByRole("button", { name: "Webshop", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Before the review");
  await projects(page);
  await page
    .getByRole("button", {
      name: "Remove version Meeting baseline",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Cancel removal" }).click();
  await expect(
    page.getByRole("button", { name: "Restore Meeting baseline" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Remove version Meeting baseline",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Remove version", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore Meeting baseline" }),
  ).toHaveCount(0);
});

test("keeps a shared snapshot as a separate project and requires confirmation to remove a project", async ({
  page,
}) => {
  await page.goto("/");
  await edit(page, "Project name", "Local original");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const shared = { ...createProject(), name: "Shared direction" };
  await page.goto(makeShareUrl(shared, page.url()));
  await projects(page);
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Keep this copy", exact: true })
    .click();
  await projects(page);
  await expect(page.locator(".project-list").first().locator("li")).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Remove Local original", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel removal" }).click();
  await expect(
    page.getByRole("button", { name: "Open Local original", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove Local original", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove project", exact: true })
    .click();
  await expect(page.locator(".project-list").first().locator("li")).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "Remove Shared direction", exact: true }),
  ).toBeDisabled();
});

test("protects a newer save from a stale tab and keeps exporting the unsaved draft possible", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Saved on this device")).toBeVisible();
  await edit(page, "Hero headline", "The newer saved idea");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await edit(other, "Hero headline", "The stale tab's draft");
  await expect(
    other.getByText("Could not save — export a backup"),
  ).toBeVisible();
  await projects(other);
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
    "another tab",
  );
  await other.getByRole("button", { name: "Close dialog" }).click();
  const download = other.waitForEvent("download");
  await other
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.formlane\.json$/);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("The newer saved idea");
});

test("preserves corrupt library bytes before explicit recovery and does not overwrite them on editing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("corrupt-library")) {
      localStorage.setItem("formlane.library.v1", "{unreadable collection");
      sessionStorage.setItem("corrupt-library", "yes");
    }
  });
  await page.goto("/");
  await expect(
    page.getByText(/Your project library could not be read/),
  ).toBeVisible();
  await edit(page, "Hero headline", "Recovered direction");
  expect(
    await page.evaluate(() => localStorage.getItem("formlane.library.v1")),
  ).toBe("{unreadable collection");
  await page
    .getByRole("button", { name: "Save this draft", exact: true })
    .click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const backup = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("formlane.library.recovery."))
      .map((key) => localStorage.getItem(key)),
  );
  expect(backup).toEqual(["{unreadable collection"]);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Recovered direction");
});

test("prepares current and complete PDFs with real PDF output and returns to the unchanged editor", async ({
  page,
}) => {
  await page.goto("/?template=blog");
  await edit(page, "Hero headline", "Notes for the workshop");
  await pdf(page);
  await expect(
    page.getByRole("heading", { name: "Ready for the meeting." }),
  ).toBeFocused();
  await expect(page.locator("[contenteditable]")).toHaveCount(0);
  await expect(page.locator(".pdf-template")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Blog PDF", exact: true }),
  ).toContainText("Notes for the workshop");
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "yes";
    };
  });
  await page
    .getByRole("button", { name: "Print / save PDF", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-requested",
    "yes",
  );
  const current = await page.pdf({
    path: "test-results/formlane-blog.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(current.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByLabel("PDF templates").selectOption("all");
  await expect(page.locator(".pdf-template")).toHaveCount(6);
  await expect(page.locator(".text-metric p").first()).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
  await expect(page.locator(".pdf-template [contenteditable]")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".pdf-controls")).toBeHidden();
  const complete = await page.pdf({
    path: "test-results/formlane-meeting.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(complete.length).toBeGreaterThan(current.length);
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Notes for the workshop");
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-template",
    "blog",
  );
});

test("prints every row of a long wide table without horizontal scrolling", async ({
  page,
}) => {
  const project = createProject();
  const table = project.pages.table.find((block) => block.type === "table")!;
  table.headers = Array.from(
    { length: 20 },
    (_, index) => `Column ${index + 1}`,
  );
  table.rows = Array.from({ length: 100 }, (_, index) =>
    table.headers.map((_, column) => `R${index + 1}C${column + 1}`),
  );
  await page.goto("/?template=table");
  await page.locator('input[type="file"]').setInputFiles({
    name: "large.formlane.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await pdf(page);
  await page.emulateMedia({ media: "print" });
  const bounds = await page.locator(".table-scroll").evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
  await expect(
    page.getByRole("cell", { name: "R100C20", exact: true }),
  ).toBeVisible();
  const result = await page.pdf({
    path: "test-results/formlane-long-table.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(result.length).toBeGreaterThan(20_000);
});

test("can free storage from the library without losing the unsaved working draft", async ({
  page,
}) => {
  await page.goto("/");
  await projects(page);
  await page.getByLabel("New project name").fill("Current workshop");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.evaluate(() => {
    const budget = localStorage.getItem("formlane.library.v1")!.length;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "formlane.library.v1" && value.length > budget)
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  const draft = "An idea worth keeping. ".repeat(40).trim();
  await edit(page, "Hero headline", draft);
  await expect(
    page.getByText("Could not save — export a backup"),
  ).toBeVisible();
  await projects(page);
  await expect(page.locator(".project-list").first().locator("li")).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Remove A little possibility", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove project", exact: true })
    .click();
  await expect(page.locator(".project-list").first().locator("li")).toHaveCount(
    1,
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText(draft);
});

test("project library and PDF controls are accessible on a phone", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    (await new AxeBuilder({ page }).include(".workspace-switch").analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await projects(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await pdf(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
