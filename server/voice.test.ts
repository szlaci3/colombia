import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { config } from "../netlify/functions/voice-token.mts";
import { createVoiceHandler, voiceSettings, voiceTokenPayload } from "./voice";

const origin = "https://formlane.example";
const settings = { enabled: true, apiKey: "permanent-server-secret" };
const request = (extra: RequestInit = {}) =>
  new Request(`${origin}/api/voice-token`, {
    method: "POST",
    headers: { Origin: origin },
    ...extra,
  });

describe("native Dialog token endpoint", () => {
  it("locks the entire Gemini 3.8 native-audio setup and issues a short-lived single-use token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ name: "auth_tokens/test-session" }));
    const now = Date.parse("2026-10-21T12:00:00Z");
    const handler = createVoiceHandler({
      settings: () => settings,
      fetcher,
      now: () => now,
    });
    const response = await handler(request());
    const body = await response.json();
    expect(body.token).toBe("auth_tokens/test-session");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
    );
    expect(init.headers["x-goog-api-key"]).toBe(settings.apiKey);
    const payload = JSON.parse(init.body);
    expect(payload).toEqual(voiceTokenPayload(now));
    expect(payload.uses).toBe(1);
    expect(Date.parse(payload.newSessionExpireTime) - now).toBe(60_000);
    expect(Date.parse(payload.expireTime) - now).toBe(30 * 60_000);
    expect(payload.fieldMask).toBeUndefined();
    // Google constrains exactly the setup the browser will send, including
    // the complete current guide rather than a separately maintained summary.
    expect(payload.bidiGenerateContentSetup).toEqual(body.setup);
    const parts = body.setup.systemInstruction.parts;
    expect(parts[1].text).toBe(
      `<formlane_product_guide>\n${readFileSync("docs/formlane-guide.md", "utf8").trim()}\n</formlane_product_guide>`,
    );
    expect(parts[0].text).toContain("You cannot see the screen");
    expect(parts[0].text).toContain(
      "You have no browsing, retrieval, or application tools",
    );
    expect(body.setup).toMatchObject({
      model: "models/gemini-3.8-live",
      generationConfig: { responseModalities: ["AUDIO"] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    });
    expect(body.setup.tools).toBeUndefined();
    expect(body.setup.generationConfig.thinkingConfig).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(settings.apiKey);
    expect(config).toMatchObject({
      path: "/api/voice-token",
      rateLimit: { windowLimit: 6 },
    });
  });

  it("publishes availability without issuing tokens and keeps activation independent from the editing assistant", async () => {
    const fetcher = vi.fn();
    for (const value of [
      { enabled: false, apiKey: "secret" },
      { enabled: true, apiKey: "" },
    ]) {
      const handler = createVoiceHandler({ settings: () => value, fetcher });
      const response = await handler(new Request(`${origin}/api/voice-token`));
      expect(await response.json()).toEqual({
        enabled: false,
        model: "gemini-3.8-live",
      });
      expect((await handler(request())).status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("FORMLANE_VOICE_ENABLED", "true");
    vi.stubEnv("FORMLANE_ASSISTANT_ENABLED", "false");
    vi.stubEnv("GEMINI_API_KEY", "test");
    expect(voiceSettings()).toEqual({ enabled: true, apiKey: "test" });
    vi.unstubAllEnvs();
  });

  it("rejects missing/foreign origins, methods, and client configuration before contacting Google", async () => {
    const fetcher = vi.fn();
    const handler = createVoiceHandler({ settings: () => settings, fetcher });
    expect((await handler(request({ headers: {} }))).status).toBe(403);
    expect(
      (await handler(request({ headers: { Origin: "https://other.example" } })))
        .status,
    ).toBe(403);
    expect((await handler(request({ method: "DELETE" }))).status).toBe(405);
    expect(
      (
        await handler(
          request({ body: JSON.stringify({ model: "other", tools: [] }) }),
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes provider errors, malformed/oversized responses, and connection failures", async () => {
    for (const response of [
      new Response(settings.apiKey, { status: 403 }),
      new Response(settings.apiKey, { status: 429 }),
      Response.json({ name: settings.apiKey }),
      new Response("x".repeat(16_001)),
      new Response("not JSON"),
    ]) {
      const handler = createVoiceHandler({
        settings: () => settings,
        fetcher: vi.fn().mockResolvedValue(response),
      });
      const result = await handler(request());
      expect([429, 502]).toContain(result.status);
      expect(await result.text()).not.toContain(settings.apiKey);
    }
    const handler = createVoiceHandler({
      settings: () => settings,
      fetcher: vi.fn().mockRejectedValue(new Error(settings.apiKey)),
    });
    expect(await (await handler(request())).text()).not.toContain(
      settings.apiKey,
    );
  });
});
