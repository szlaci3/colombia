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
