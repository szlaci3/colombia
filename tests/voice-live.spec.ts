import path from "node:path";
import { test, expect } from "@playwright/test";

// Explicit opt-in, local server only. The WAV must contain a short spoken phrase
// after 12 seconds of silence (allowing secure session setup), then silence.
const enabled = process.env.FORMLANE_VOICE_LIVE === "true";
const input = process.env.FORMLANE_VOICE_INPUT;
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...(input
        ? [`--use-file-for-fake-audio-capture=${path.resolve(input)}`]
        : []),
    ],
  },
});

test("opt-in real Gemini 3.8 Dialog receives speech, both transcripts, and native audio", async ({
  page,
  baseURL,
}) => {
  test.skip(
    !enabled,
    "Set FORMLANE_VOICE_LIVE=true and FORMLANE_VOICE_INPUT to opt in.",
  );
  test.setTimeout(65_000);
  expect(input, "A synthetic WAV input is required.").toBeTruthy();
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(baseURL!).hostname,
  );
  const errors: string[] = [];
  let inputPackets = 0;
  let audioParts = 0;
  let selectedModel = "";
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://generativelanguage.googleapis.com/"))
      return;
    socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.setup) selectedModel = message.setup.model;
      if (message.realtimeInput?.audio) inputPackets++;
    });
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(payload.toString());
      audioParts += (message.serverContent?.modelTurn?.parts ?? []).filter(
        (part: { inlineData?: unknown }) => part.inlineData,
      ).length;
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Dialog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start Dialogue", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Start Dialogue", exact: true })
    .click();
  await expect(
    page.getByText("Listening — you can speak", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".voice-user p").first()).not.toBeEmpty({
    timeout: 30_000,
  });
  await expect(page.locator(".voice-assistant p").first()).not.toHaveText(
    "Waiting for the voice transcript…",
    { timeout: 30_000 },
  );
  await expect.poll(() => audioParts, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(inputPackets).toBeGreaterThan(0);
  expect(selectedModel).toBe("models/gemini-3.8-live");
  console.log(
    JSON.stringify({
      model: selectedModel,
      input: await page.locator(".voice-user p").first().textContent(),
      output: await page.locator(".voice-assistant p").first().textContent(),
      inputPackets,
      nativeAudioParts: audioParts,
    }),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Stop Dialogue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start Dialogue", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
