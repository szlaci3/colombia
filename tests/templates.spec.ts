import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import LZString from "lz-string";
import legacy from "./fixtures/legacy-v1.formlane.json" with { type: "json" };

async function navigate(page: Page, title: string) {
  await page
    .getByRole("navigation", { name: "Templates" })
    .getByRole("button", { name: title, exact: true })
    .click();
}
async function edit(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Tab");
}

test("edits all new templates independently, shares their brand, and preserves content and variants after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/?template=blog");
  await page.getByLabel("Brand name", { exact: true }).fill("Fieldwork");
  await page.getByRole("button", { name: "Tide theme", exact: true }).click();
  await edit(
    page
      .locator('[data-text-appearance="article"]')
      .first()
      .getByRole("textbox", { name: "Section title", exact: true }),
    "Room for everyone",
  );
  await navigate(page, "Social feed");
  const post = page.locator('[data-text-appearance="post"]').first();
  await edit(
    post.getByRole("textbox", { name: "Section title", exact: true }),
    "Morgan Taylor",
  );
  await edit(
    post.getByRole("textbox", { name: "Section body", exact: true }),
    "A little community update.",
  );
  await expect(post.locator(".post-avatar")).toHaveText("MT");
  await navigate(page, "Dashboard");
  const metric = page.locator('[data-text-appearance="metric"]').first();
  await edit(
    metric.getByRole("textbox", { name: "Section body", exact: true }),
    "18\nExperiments this week",
  );
  await metric
    .getByLabel("Section style", { exact: true })
    .selectOption("plain");
  await expect(page.locator('[data-text-appearance="metric"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-text-appearance="metric"]')).toHaveCount(3);
  await expect(
    metric.getByRole("textbox", { name: "Section body", exact: true }),
  ).toHaveText("18\nExperiments this week");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(
    metric.getByRole("textbox", { name: "Section body", exact: true }),
  ).toHaveText("18\nExperiments this week");
  for (const title of ["Blog", "Social feed", "Dashboard"]) {
    await navigate(page, title);
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-theme",
      "tide",
    );
    await expect(
      page.getByRole("textbox", { name: "Canvas brand name", exact: true }),
    ).toHaveText("Fieldwork");
  }
  await navigate(page, "Blog");
  await expect(
    page.locator('[data-text-appearance="article"]').first(),
  ).toContainText("Room for everyone");
  await navigate(page, "Social feed");
  await expect(post).toContainText("A little community update.");
});

test("duplicates and rearranges article sections with undo and keeps their presentation", async ({
  page,
}) => {
  await page.goto("/?template=blog");
  const articles = page.locator('[data-text-appearance="article"]');
  await articles
    .first()
    .getByRole("button", { name: "Duplicate Text section", exact: true })
    .click();
  await expect(articles).toHaveCount(4);
  await edit(
    articles
      .nth(1)
      .getByRole("textbox", { name: "Section title", exact: true }),
    "A new editorial direction",
  );
  await articles
    .nth(1)
    .getByRole("button", { name: "Move Text section up", exact: true })
    .click();
  await expect(articles.first()).toContainText("A new editorial direction");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(articles.nth(1)).toContainText("A new editorial direction");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(articles).toHaveCount(3);
});

test("reorders dashboard metric cards with keyboard dragging and undoes the move", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/?template=dashboard");
  await page.evaluate(() => document.fonts.ready);
  const metrics = page.locator('[data-text-appearance="metric"]');
  const before = await metrics
    .getByRole("textbox", { name: "Section title", exact: true })
    .allTextContents();
  const card = await metrics.first().locator(".text-metric").boundingBox();
  const table = await page.locator('[data-block-type="table"]').boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(table!.y + 1);
  const targetId = await metrics.nth(1).getAttribute("data-block-id");
  const handle = metrics
    .first()
    .getByRole("button", { name: "Drag Text section", exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[aria-live="assertive"]')).toContainText(
    `was moved over droppable area ${targetId}`,
  );
  await page.keyboard.press("Space");
  await expect(
    metrics
      .first()
      .getByRole("textbox", { name: "Section title", exact: true }),
  ).toHaveText(before[1]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    metrics
      .first()
      .getByRole("textbox", { name: "Section title", exact: true }),
  ).toHaveText(before[0]);
});

test("opens a legacy local save on a new template without losing existing content", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem("legacy-initialized")) {
      localStorage.setItem("formlane.project.v1", JSON.stringify(value));
      sessionStorage.setItem("legacy-initialized", "yes");
    }
  }, legacy);
  await page.goto("/?template=social");
  await expect(page.locator('[data-text-appearance="post"]')).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("formlane.project.v1")!),
  );
  for (const key of ["webshop", "kanban", "table"] as const)
    expect(saved.pages[key]).toEqual(legacy.pages[key]);
  expect(Object.keys(saved.pages)).toHaveLength(6);
  await navigate(page, "Webshop");
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Our original welcome");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name", exact: true }),
  ).toHaveText("Nook");
});

test("imports an old project file and opens an old shared snapshot with protected local saving", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy.formlane.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toHaveText("Our original welcome");
  await navigate(page, "Dashboard");
  await expect(page.locator('[data-text-appearance="metric"]')).toHaveCount(3);
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const saved = await page.evaluate(() =>
    localStorage.getItem("formlane.project.v1"),
  );
  const shared = { ...legacy, brand: "Shared Nook" };
  await page.goto(
    `/?template=blog#project=${LZString.compressToEncodedURIComponent(JSON.stringify(shared))}`,
  );
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name", exact: true }),
  ).toHaveText("Shared Nook");
  await expect(page.locator('[data-text-appearance="article"]')).toHaveCount(3);
  expect(
    await page.evaluate(() => localStorage.getItem("formlane.project.v1")),
  ).toBe(saved);
  await page
    .getByRole("button", { name: "Keep this copy", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Canvas brand name", exact: true }),
  ).toHaveText("Shared Nook");
});

test("adds Markdown to the blog, switches its style, and shares the result across fresh contexts", async ({
  page,
  browser,
}) => {
  await page.goto("/?template=blog");
  await page
    .getByRole("button", { name: "Start from a website", exact: true })
    .click();
  await page.getByRole("button", { name: "Page content", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste Markdown", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your Markdown", exact: true })
    .fill("# Guest notes\n\nA new story for our journal.");
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add 1 section to Blog", exact: true })
    .click();
  const last = page.locator('[data-block-type="text"]').last();
  await last
    .getByLabel("Section style", { exact: true })
    .selectOption("article");
  await page
    .getByRole("button", { name: "Share prototype", exact: false })
    .click();
  const url = await page
    .getByLabel("Snapshot link", { exact: true })
    .inputValue();
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto(url);
    await expect(
      recipient.locator('[data-text-appearance="article"]').last(),
    ).toContainText("Guest notes");
    await recipient
      .getByRole("button", { name: "Present", exact: true })
      .click();
    await expect(recipient.locator('[contenteditable="true"]')).toHaveCount(0);
    await expect(
      recipient.getByLabel("Section style", { exact: true }),
    ).toHaveCount(0);
    for (const template of ["social", "dashboard", "blog"]) {
      await recipient
        .getByLabel("Presentation template")
        .selectOption(template);
      await expect(recipient.locator(".prototype-canvas")).toHaveAttribute(
        "data-template",
        template,
      );
    }
    await expect(
      recipient.getByRole("heading", { name: "Guest notes", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const [id, title] of [
  ["blog", "Blog"],
  ["social", "Social feed"],
  ["dashboard", "Dashboard"],
] as const) {
  test(`fits the ${title} template on a phone and in mobile preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?template=${id}`);
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-template",
      id,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Mobile preview", exact: true })
      .click();
    await expect(page.locator(".prototype-canvas")).toBeVisible();
    const checks = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      checks.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/formlane-${id}-phone.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await navigate(page, "Webshop");
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await navigate(page, title);
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-template",
      id,
    );
  });
}
