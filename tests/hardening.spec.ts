import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("phone navigation contains focus, restores it on close, and releases the editor on resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?template=kanban");
  const opener = page.getByRole("button", {
    name: "Toggle navigation",
    exact: true,
  });
  await opener.click();
  const drawer = page.getByRole("dialog", {
    name: "Workspace navigation",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Kanban board", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  const close = drawer.getByRole("button", {
    name: "Close navigation",
    exact: true,
  });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    drawer.getByRole("button", { name: "A little guidance", exact: false }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await opener.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page
    .getByRole("button", { name: "Explore with AI", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("opening tools from phone navigation leaves one dialog and restores the navigation trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const opener = page.getByRole("button", {
    name: "Toggle navigation",
    exact: true,
  });
  await opener.click();
  await page
    .getByRole("button", { name: "Explore building blocks", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", {
      name: "A little more possibility.",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await page
    .getByRole("button", { name: "Take a quick tour", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator(".introduction-video video")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("composing Enter and Escape keep text editing active until the input method finishes", async ({
  page,
}) => {
  await page.goto("/");
  const headline = page.getByRole("textbox", {
    name: "Hero headline",
    exact: true,
  });
  await headline.fill("入力中のアイデア");
  await headline.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(headline).toBeFocused();
  await headline.dispatchEvent("keydown", {
    key: "Escape",
    code: "Escape",
    isComposing: true,
    bubbles: true,
  });
  await expect(headline).toBeFocused();
  await expect(headline).toHaveText("入力中のアイデア");
  await headline.press("Enter");
  await expect(headline).not.toBeFocused();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(headline).toHaveText("入力中のアイデア");
});

test("dragging out of a dialog and clicking its border preserve an unfinished request", async ({
  page,
}) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({ json: { enabled: false, provider: "Google Gemini" } }),
  );
  await page.goto("/");
  const opener = page.getByRole("button", {
    name: "Explore with AI",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  const prompt = page.getByLabel("What would you like to explore?");
  await prompt.fill("Keep this unfinished request");
  const input = await prompt.boundingBox();
  await page.mouse.move(input!.x + 30, input!.y + 30);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(prompt).toHaveValue("Keep this unfinished request");
  const bounds = await dialog.boundingBox();
  await page.mouse.click(bounds!.x + 0.5, bounds!.y + bounds!.height / 2);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
