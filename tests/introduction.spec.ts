import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test("watches and downloads the introduction without changing the draft", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("video")).toHaveCount(0);
  const headline = page.getByRole("textbox", {
    name: "Hero headline",
    exact: true,
  });
  await headline.fill("Keep this meeting idea");
  await headline.press("Tab");
  const opener = page.getByRole("button", {
    name: "How it works",
    exact: false,
  });
  await opener.click();
  const video = page.locator(".introduction-video video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.duration))
    .toBe(80.5);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(true);
  await video.evaluate(async (element: HTMLVideoElement) => {
    await element.play();
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(0.1);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download video", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("formlane-introduction.mp4");
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const hash = (buffer: Buffer) =>
    createHash("sha256").update(buffer).digest("hex");
  expect(hash(await readFile(downloadedPath!))).toBe(
    hash(await readFile("docs/video/formlane-introduction.mp4")),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(video).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(headline).toHaveText("Keep this meeting idea");
});

test("opens the shared introduction link on a phone without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?intro=video");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const video = page.locator(".introduction-video video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("playsinline", "");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await video.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
