import { test, expect } from "@playwright/test";

test("serves a compiled JavaScript module and starts the editor", async ({
  request,
  page,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/html\b/);
  const html = await response.text();
  expect(
    html,
    "Deploy the built dist folder, not the source root",
  ).not.toContain("/src/main.tsx");
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(
    (match) => match[0],
  );
  const moduleTag = scripts.find((tag) => /\btype=["']module["']/i.test(tag));
  const moduleSrc = moduleTag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  expect(
    moduleSrc,
    "The built HTML must reference a compiled JavaScript module",
  ).toMatch(/^\/assets\/[^?#]+\.js$/);
  const module = await request.get(moduleSrc!);
  expect(module.status()).toBe(200);
  expect(module.headers()["content-type"]).toMatch(
    /^(?:text|application)\/javascript\b/,
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next idea, taking shape." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Hero headline", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const template of ["webshop", "kanban", "table"]) {
  test(`opens the deployed ${template} template directly`, async ({ page }) => {
    await page.goto(`/?template=${template}`);
    await expect(page.locator(".prototype-canvas")).toBeVisible();
    if (template === "webshop")
      await expect(
        page.getByRole("textbox", { name: "Hero headline", exact: true }),
      ).toBeVisible();
    if (template === "kanban")
      await expect(page.locator(".board-columns")).toBeVisible();
    if (template === "table")
      await expect(page.getByRole("table")).toBeVisible();
  });
}

for (const endpoint of ["import-style", "import-content"]) {
  test(`the deployed ${endpoint} endpoint rejects unsafe targets`, async ({
    request,
  }) => {
    const method = await request.get(`/api/${endpoint}`);
    expect(method.status()).toBe(405);
    const response = await request.post(`/api/${endpoint}`, {
      data: { url: "https://127.0.0.1/latest/meta-data" },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/public website/);
  });
}

test("loads the Markdown tools on demand and imports a selected table without API requests", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start from a website", exact: true })
    .click();
  await page.getByRole("button", { name: "Page content", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste Markdown", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use the meeting notes example" })
    .click();
  await page
    .getByRole("button", { name: "Prepare sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Include section 3: Our next steps",
      exact: true,
    })
    .check();
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
    .getByRole("button", { name: "Add 1 section to Webshop", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Row 1, Owner", exact: true }),
  ).toHaveText("Alex");
  expect(apiRequests).toEqual([]);
});

if (process.env.FORMLANE_IMPORT_URL) {
  test("imports a real website through the hosted function and applies the reviewed style", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Start from a website", exact: true })
      .click();
    await page
      .getByLabel("Website URL", { exact: true })
      .fill(process.env.FORMLANE_IMPORT_URL!);
    await page
      .getByRole("button", { name: "Explore style", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Apply to all templates" }),
    ).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator(".detected-colors")).toContainText(
      "linked stylesheet",
    );
    await page
      .getByText("Where these styles came from", { exact: true })
      .click();
    await expect(page.locator(".style-evidence dl > div")).toHaveCount(5);
    await expect(page.locator(".style-evidence")).toContainText("Prototype:");
    await page.getByRole("button", { name: "Apply to all templates" }).click();
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-theme",
      "custom",
    );
    await page
      .getByRole("navigation", { name: "Templates" })
      .getByRole("button", { name: "Data table", exact: true })
      .click();
    await expect(page.locator(".prototype-canvas")).toHaveAttribute(
      "data-theme",
      "custom",
    );
  });
}

if (process.env.FORMLANE_CONTENT_URL) {
  test("reads a real page through the hosted function, downloads Markdown, and imports an editable table", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Start from a website", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Page content", exact: true })
      .click();
    await page
      .getByLabel("Content website URL", { exact: true })
      .fill(process.env.FORMLANE_CONTENT_URL!);
    await page.getByRole("button", { name: "Read page", exact: true }).click();
    const apply = page.getByRole("button", {
      name: /Add \d+ sections? to Webshop/,
    });
    await expect(apply).toBeEnabled({ timeout: 20_000 });
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download Markdown", exact: true })
      .click();
    const download = await downloaded;
    const { readFileSync } = await import("node:fs");
    const markdown = readFileSync((await download.path())!, "utf8");
    expect(markdown).toContain("Source:");
    expect(markdown).toContain("| Idea | Next step | Owner |");
    await apply.click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Row 1, Owner", exact: true }),
    ).toHaveText("Alex");
  });
}
