import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createProject } from "../src/model";

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Templates" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function edit(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("edits text, cancels with Escape, and restores it after reloading", async ({
  page,
}) => {
  await edit(page, "Hero headline", "Good ideas live here.");
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Good ideas live here.");
  const title = page.getByRole("textbox", {
    name: "Hero headline",
    exact: true,
  });
  await title.fill("Discard this change");
  await title.press("Escape");
  await expect(title).toHaveText("Good ideas live here.");
  await edit(page, "Hero headline", "");
  await expect(title).toBeVisible();
  await edit(page, "Hero headline", "Good ideas live here.");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(title).toHaveText("Good ideas live here.");
});

test("applies brand and theme to all six pages and preserves edits when switching", async ({
  page,
}) => {
  await page.getByLabel("Brand name", { exact: true }).fill("Fieldwork");
  await page.getByRole("button", { name: "Tide theme" }).click();
  await page.getByLabel("Headings Typography").selectOption("sans");
  await edit(page, "Product 1 name", "Fieldwork vase");
  for (const name of [
    "Kanban board",
    "Data table",
    "Blog",
    "Social feed",
    "Dashboard",
    "Webshop",
  ]) {
    await navigate(page, name);
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-theme",
      "tide",
    );
    await expect(
      page.getByRole("textbox", { name: "Canvas brand name" }),
    ).toHaveText("Fieldwork");
  }
  await expect(
    page.getByRole("textbox", { name: "Product 1 name", exact: true }),
  ).toHaveText("Fieldwork vase");
  await page.reload();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "tide",
  );
});

test("adds, renames, edits, and deletes table structure with undo and redo", async ({
  page,
}) => {
  await navigate(page, "Data table");
  await expect(page.getByRole("row")).toHaveCount(6);
  await edit(page, "Column 1 header", "Customer");
  await edit(page, "Row 1, Customer", "Casey Smith");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(7);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await edit(page, "Column 5 header", "Region");
  await edit(page, "Row 6, Region", "Europe");
  await page.getByRole("button", { name: "Delete row 2", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(6);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(7);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(
    page.getByRole("textbox", { name: "Row 1, Customer" }),
  ).toHaveText("Casey Smith");
  await expect(page.getByRole("textbox", { name: "Row 5, Region" })).toHaveText(
    "Europe",
  );
  await page.getByRole("button", { name: "Last column", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Column 5 header" }),
  ).toHaveCount(0);
});

test("moves cards to another column, adds cards and columns, and undoes deletion", async ({
  page,
}) => {
  await navigate(page, "Kanban board");
  const title = "Find our visual direction";
  const menu = page.getByRole("combobox", {
    name: `Move ${title}`,
    exact: true,
  });
  await menu.selectOption({ label: "Ready to share" });
  await expect(page.locator(".board-column").nth(2)).toContainText(title);
  await page
    .getByRole("button", { name: "Add a card", exact: true })
    .nth(2)
    .click();
  await edit(page, "Card title: A new possibility", "Show the team");
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await expect(page.locator(".board-column")).toHaveCount(4);
  await page
    .getByRole("combobox", { name: "Move Show the team", exact: true })
    .selectOption({ label: "New column" });
  await expect(page.locator(".board-column").nth(3)).toContainText(
    "Show the team",
  );
  await page.getByRole("button", { name: "Delete column New column" }).click();
  await expect(page.locator(".board-column")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".board-column").nth(3)).toContainText(
    "Show the team",
  );
});

test("adds, duplicates, rearranges, and removes a section, with all changes reversible", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add a section", exact: false })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Text section", exact: false })
    .click();
  await expect(page.locator("[data-block-type]")).toHaveCount(4);
  await edit(page, "Section title", "Our story");
  await page
    .getByRole("button", { name: "Duplicate Text section", exact: true })
    .click();
  await expect(page.locator('[data-block-type="text"]')).toHaveCount(2);
  await page
    .getByRole("button", { name: "Move Text section up", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Delete Text section", exact: true })
    .last()
    .click();
  await expect(page.locator("[data-block-type]")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-block-type]")).toHaveCount(5);
});

test("rearranges sections with a keyboard drag handle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.evaluate(() => document.fonts.ready);
  const handle = page.getByRole("button", {
    name: "Drag Hero section",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  const targetId = await page
    .locator('[data-block-type="products"]')
    .getAttribute("data-block-id");
  await expect(page.locator('[aria-live="assertive"]')).toContainText(
    `was moved over droppable area ${targetId}`,
  );
  await page.keyboard.press("Space");
  await expect(page.locator("[data-block-type]").first()).toHaveAttribute(
    "data-block-type",
    "products",
  );
  await expect(page.locator("[data-block-type]").nth(1)).toHaveAttribute(
    "data-block-type",
    "hero",
  );
});

test("drags a Kanban card across columns with the pointer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await navigate(page, "Kanban board");
  const handle = page.getByRole("button", {
    name: "Drag card Find our visual direction",
    exact: true,
  });
  const source = await handle.boundingBox();
  const target = await page.locator(".board-column").nth(2).boundingBox();
  if (!source || !target) throw new Error("Drag targets are missing");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 20, source.y + 15, { steps: 5 });
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height - 40,
    { steps: 25 },
  );
  await page.mouse.up();
  await expect(page.locator(".board-column").nth(2)).toContainText(
    "Find our visual direction",
  );
});

test("shares a snapshot across fresh browser contexts without overwriting a local draft", async ({
  page,
  browser,
}) => {
  await edit(page, "Hero headline", "A shared perspective");
  await page
    .getByRole("button", { name: "Share prototype", exact: false })
    .click();
  const url = await page
    .getByLabel("Snapshot link", { exact: true })
    .inputValue();
  expect(url).toContain("#project=");
  const other = await browser.newContext();
  const recipient = await other.newPage();
  await recipient.goto("/");
  await edit(recipient, "Hero headline", "My existing draft");
  await expect(recipient.getByText("Saved on this device")).toBeVisible();
  await recipient.goto(url);
  await expect(
    recipient.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("A shared perspective");
  expect(
    JSON.parse(
      (await recipient.evaluate(() =>
        localStorage.getItem("formlane.project.v1"),
      ))!,
    ),
  ).toHaveProperty("pages.webshop.0.title", "My existing draft");
  await recipient
    .getByRole("button", { name: "Keep this copy", exact: true })
    .click();
  await expect(recipient).not.toHaveURL(/#project=/);
  await recipient.reload();
  await expect(
    recipient.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("A shared perspective");
  await other.close();
});

test("exports and reimports the actual project, and rejects invalid imports", async ({
  page,
}) => {
  await edit(page, "Hero headline", "A portable little idea");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.formlane\.json$/);
  await edit(page, "Hero headline", "A different direction");
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("A portable little idea");
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(
    page.getByText(
      "This is not a supported Formlane v1 project. Your current project is unchanged.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("A portable little idea");
});

test("presentation hides editing controls, navigates templates, and Escape returns to editing", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Exit presentation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add row", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Presentation template").selectOption("table");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete row 1" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Add row", exact: true }),
  ).toBeVisible();
});

test("supports direct template URLs and browser back/forward navigation", async ({
  page,
}) => {
  await page.goto("/?template=table");
  await expect(page.getByRole("table")).toBeVisible();
  await navigate(page, "Kanban board");
  await expect(page).toHaveURL(/template=kanban/);
  await page.goBack();
  await expect(page.getByRole("table")).toBeVisible();
  await page.goForward();
  await expect(page.locator(".board-columns")).toBeVisible();
});

test("recovers corrupted saved data without overwriting it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("recovery-test-initialized")) {
      localStorage.setItem("formlane.project.v1", "{broken");
      sessionStorage.setItem("recovery-test-initialized", "true");
    }
  });
  await page.reload();
  await expect(page.getByText(/Autosave is paused/)).toBeVisible();
  await edit(page, "Hero headline", "Recovered draft");
  expect(
    await page.evaluate(() => localStorage.getItem("formlane.project.v1")),
  ).toBe("{broken");
  await page
    .getByRole("button", { name: "Save this draft", exact: true })
    .click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Recovered draft");
});

test("shows a save failure when browser storage is full and still exports", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.reload();
  await expect(
    page.getByText("Could not save — export a backup"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("alert")).toContainText("aren’t being saved");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test("start fresh is reversible and requires an explicit dialog action", async ({
  page,
}) => {
  await edit(page, "Hero headline", "Keep this idea");
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Keep this idea");
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start fresh", exact: false })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toContainText("A slower pace.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Keep this idea");
});

test("works on a phone without page overflow and opens template navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await navigate(page, "Data table");
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mobile preview" }).click();
  await expect(
    page.getByRole("button", { name: "Mobile preview" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("has no serious accessibility issues in each template or in dialogs", async ({
  page,
}) => {
  for (const template of [
    "Webshop",
    "Kanban board",
    "Data table",
    "Blog",
    "Social feed",
    "Dashboard",
  ]) {
    await navigate(page, template);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const issues = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      issues.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          detail: n.any[0]?.message ?? n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  await page
    .getByRole("button", { name: "How it works", exact: false })
    .click();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const issues = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    issues.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});

test("has no browser errors during editing or a production-like page reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  for (const name of [
    "Kanban board",
    "Data table",
    "Blog",
    "Social feed",
    "Dashboard",
    "Webshop",
  ]) {
    await navigate(page, name);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/formlane-${name.toLowerCase().replace(" ", "-")}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Atelier theme" }).click();
  await expect(page.locator(".prototype-canvas")).toHaveAttribute(
    "data-theme",
    "atelier",
  );
  expect(errors).toEqual([]);
});

test("maintains accessible contrast across all curated themes", async ({
  page,
}) => {
  for (const theme of ["Atelier", "Tide", "Mono"]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    for (const template of [
      "Webshop",
      "Kanban board",
      "Data table",
      "Blog",
      "Social feed",
      "Dashboard",
    ]) {
      await navigate(page, template);
      const results = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          theme,
          template,
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            detail: n.any[0]?.message,
          })),
        })),
      ).toEqual([]);
    }
  }
});

test("keeps imported HTML and rich pasted content inert", async ({ page }) => {
  const project = createProject();
  project.brand = "<img src=x onerror=alert(1)>";
  const hero = project.pages.webshop[0];
  if (hero.type !== "hero") throw new Error("Expected hero");
  hero.title = "<script>window.compromised = true</script>";
  await page.locator('input[type="file"]').setInputFiles({
    name: "untrusted.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name" }),
  ).toHaveText(project.brand);
  const headline = page.getByRole("textbox", {
    name: "Hero headline",
    exact: true,
  });
  await expect(headline).toHaveText(hero.title);
  await expect(
    page.locator(".prototype-canvas img, .prototype-canvas script"),
  ).toHaveCount(0);
  await headline.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await headline.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "A plain-text idea");
    data.setData(
      "text/html",
      "<b>A rich-text idea</b><img src=x onerror=alert(1)>",
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await headline.press("Tab");
  await expect(headline).toHaveText("A plain-text idea");
  await expect(headline.locator("*")).toHaveCount(0);
});
