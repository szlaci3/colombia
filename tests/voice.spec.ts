import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { voiceSetup } from "../src/voice-protocol";

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

async function fixture(page: Page, enabled = true) {
  const sockets: WebSocketRoute[] = [];
  const requests: unknown[] = [];
  let packets = 0;
  let tokenRequests = 0;
  await page.route("**/api/voice-token", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { enabled, model: "gemini-3.8-live" } });
    tokenRequests++;
    expect(route.request().postData()).toBeNull();
    return route.fulfill({
      json: { token: "auth_tokens/browser-test", setup: voiceSetup },
    });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (socket) => {
    sockets.push(socket);
    socket.onMessage((raw) => {
      const message = JSON.parse(raw.toString());
      if (message.setup) {
        requests.push(message);
        socket.send(Buffer.from(JSON.stringify({ setupComplete: {} })));
      }
      if (message.realtimeInput?.audio) {
        expect(message.realtimeInput.audio.mimeType).toBe(
          "audio/pcm;rate=16000",
        );
        expect(
          Buffer.from(message.realtimeInput.audio.data, "base64").length,
        ).toBeGreaterThan(0);
        packets++;
      }
    });
  });
  await page.addInitScript(() => {
    const tracked = window as unknown as {
      voiceStreams: MediaStream[];
      voiceAudioStarts: number;
      voiceAudioStops: number;
    };
    tracked.voiceStreams = [];
    tracked.voiceAudioStarts = tracked.voiceAudioStops = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      tracked.voiceStreams.push(stream);
      return stream;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      tracked.voiceAudioStarts++;
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      tracked.voiceAudioStops++;
      return stop.apply(this, args);
    };
  });
  const send = (content: unknown) =>
    sockets
      .at(-1)!
      .send(Buffer.from(JSON.stringify({ serverContent: content })));
  const start = async () => {
    await page
      .getByRole("button", { name: "Start Dialog", exact: true })
      .click();
    await expect(
      page.getByText("Listening — you can speak", { exact: true }),
    ).toBeVisible();
  };
  return {
    sockets,
    requests,
    send,
    start,
    packets: () => packets,
    tokenRequests: () => tokenRequests,
  };
}

async function open(page: Page) {
  await page.getByRole("button", { name: "Dialog", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dialog", exact: true }),
  ).toBeVisible();
}
const audio = {
  inlineData: {
    data: Buffer.alloc(48_000).toString("base64"),
    mimeType: "audio/pcm;rate=24000",
  },
};
const tracksEnded = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { voiceStreams: MediaStream[] }).voiceStreams.every(
      (stream) =>
        stream.getTracks().every((track) => track.readyState === "ended"),
    ),
  );

test("Dialog streams the microphone and native audio automatically, keeps both transcripts in order, and retains them on reopen", async ({
  page,
}) => {
  const mock = await fixture(page);
  await page.goto("/");
  await open(page);
  await mock.start();
  await expect.poll(mock.packets).toBeGreaterThan(0);
  expect(mock.requests).toEqual([{ setup: voiceSetup }]);
  mock.send({
    outputTranscription: { text: "Hello, how can I help?" },
    modelTurn: { parts: [audio, audio] },
  });
  mock.send({ turnComplete: true });
  mock.send({ inputTranscription: { text: "Hello Gemini." } });
  await expect(page.locator(".voice-message p")).toHaveText([
    "Hello Gemini.",
    "Hello, how can I help?",
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceAudioStarts: number }).voiceAudioStarts,
      ),
    )
    .toBe(2);
  await expect(
    page.getByText("Gemini is speaking", { exact: true }),
  ).toBeVisible();
  mock.send({ inputTranscription: { text: "Tell me another thing." } });
  mock.send({
    outputTranscription: { text: "Certainly." },
    turnComplete: true,
  });
  await expect(page.locator(".voice-message p")).toHaveText([
    "Hello Gemini.",
    "Hello, how can I help?",
    "Tell me another thing.",
    "Certainly.",
  ]);
  await page.getByRole("button", { name: "End Dialog", exact: true }).click();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await open(page);
  await expect(page.locator(".voice-message p")).toHaveText([
    "Hello Gemini.",
    "Hello, how can I help?",
    "Tell me another thing.",
    "Certainly.",
  ]);
  await expect(
    page.getByRole("button", { name: "Start Dialog", exact: true }),
  ).toBeEnabled();
  expect(mock.tokenRequests()).toBe(1);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes("Hello Gemini."),
      ),
    ),
  ).toBe(false);
});

test("barge-in stops queued playback, labels the old answer Interrupted, and appends the next turn", async ({
  page,
}) => {
  const mock = await fixture(page);
  await page.goto("/");
  await open(page);
  await mock.start();
  mock.send({
    inputTranscription: { text: "Start a story." },
    outputTranscription: { text: "Once upon a time" },
    modelTurn: { parts: [audio, audio, audio] },
  });
  await expect(
    page.getByText("Gemini is speaking", { exact: true }),
  ).toBeVisible();
  mock.send({ interrupted: true });
  mock.send({ inputTranscription: { text: "Make it shorter." } });
  mock.send({ turnComplete: true });
  mock.send({
    outputTranscription: { text: "A very short story." },
    modelTurn: { parts: [audio] },
    turnComplete: true,
  });
  await expect(page.locator(".voice-message p")).toHaveText([
    "Start a story.",
    "Once upon a time",
    "Make it shorter.",
    "A very short story.",
  ]);
  await expect(page.getByText("Interrupted", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceAudioStops: number }).voiceAudioStops,
      ),
    )
    .toBe(3);
  await page.keyboard.press("Escape");
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await open(page);
  await expect(
    page.getByText("Once upon a time", { exact: true }),
  ).toBeVisible();
});

test("reports a lost connection, releases audio, and keeps the partial transcript", async ({
  page,
}) => {
  const mock = await fixture(page);
  await page.goto("/");
  await open(page);
  await mock.start();
  mock.send({
    inputTranscription: { text: "Keep my question" },
    outputTranscription: { text: "Keep this partial answer" },
  });
  await expect(
    page.getByText("Keep this partial answer", { exact: true }),
  ).toBeVisible();
  mock.sockets[0].close({ code: 1011, reason: "test failure" });
  await expect(page.getByRole("alert")).toContainText("connection ended");
  await expect(
    page.getByRole("button", { name: "Start Dialog", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await expect(
    page.getByText("Keep this partial answer", { exact: true }),
  ).toBeVisible();
  await mock.start();
  mock.send({
    inputTranscription: { text: "A new session" },
    outputTranscription: { text: "Still here" },
    turnComplete: true,
  });
  await expect(page.locator(".voice-message p")).toHaveText([
    "Keep my question",
    "Keep this partial answer",
    "A new session",
    "Still here",
  ]);
});

test("microphone denial is actionable and does not request a provider token", async ({
  page,
}) => {
  const mock = await fixture(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.goto("/");
  await open(page);
  await page.getByRole("button", { name: "Start Dialog", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Microphone permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Start Dialog", exact: true }),
  ).toBeEnabled();
  expect(mock.tokenRequests()).toBe(0);
});

test("unconfigured Dialog remains disabled and the real local endpoint rejects client-supplied configuration", async ({
  page,
  request,
}) => {
  const mock = await fixture(page, false);
  await page.goto("/");
  await open(page);
  await expect(
    page.getByText("Dialog is not enabled on this deployment yet.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Dialog", exact: true }),
  ).toBeDisabled();
  expect(mock.tokenRequests()).toBe(0);
  const response = await request.post("/api/voice-token", {
    headers: { Origin: "http://127.0.0.1:4173" },
    data: { model: "other" },
  });
  expect(response.status()).toBe(400);
});

test("Dialog is accessible on a phone and renders transcript content as text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await fixture(page);
  await page.goto("/");
  await open(page);
  await mock.start();
  const text = '<img src=x onerror="window.voiceInjected=true">';
  mock.send({
    inputTranscription: { text },
    outputTranscription: { text: "A".repeat(1500) },
    turnComplete: true,
  });
  await expect(page.locator(".voice-user p")).toHaveText(text);
  expect(await page.evaluate(() => "voiceInjected" in window)).toBe(false);
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(
    (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect.poll(() => tracksEnded(page)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Dialog", exact: true }),
  ).toBeFocused();
});
