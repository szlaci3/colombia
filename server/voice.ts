import { voiceSetup, VOICE_MODEL } from "../src/voice-protocol.ts";

export type VoiceSettings = { enabled: boolean; apiKey: string };
export const voiceSettings = (): VoiceSettings => ({
  enabled: process.env.FORMLANE_VOICE_ENABLED === "true",
  apiKey: process.env.GEMINI_API_KEY ?? "",
});
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function voiceTokenPayload(now = Date.now()) {
  return {
    uses: 1,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 60_000).toISOString(),
    // No field mask: the entire setup is constrained, including absent tools.
    bidiGenerateContentSetup: voiceSetup,
  };
}

export function createVoiceHandler(
  options: {
    settings?: () => VoiceSettings;
    fetcher?: typeof fetch;
    now?: () => number;
  } = {},
) {
  return async (request: Request): Promise<Response> => {
    if (!["GET", "POST"].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, POST", "Cache-Control": "no-store" },
      });
    const settings = (options.settings ?? voiceSettings)();
    const enabled = settings.enabled && !!settings.apiKey;
    if (request.method === "GET") return reply({ enabled, model: VOICE_MODEL });
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return reply({ error: "Start voice chat from Formlane." }, 403);
    // This endpoint accepts no project content or client-selected configuration.
    if (request.body !== null)
      return reply({ error: "Voice session requests must have no body." }, 400);
    if (!enabled)
      return reply(
        { error: "Voice chat is not enabled on this deployment yet." },
        503,
      );
    try {
      const response = await (options.fetcher ?? fetch)(
        "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": settings.apiKey,
          },
          body: JSON.stringify(voiceTokenPayload((options.now ?? Date.now)())),
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(15_000),
          ]),
        },
      );
      // Provider bodies may echo credentials. Never relay their text.
      if (!response.ok) {
        await response.body?.cancel();
        return reply(
          {
            error:
              response.status === 429
                ? "Google's voice service is busy or its quota is exhausted. Try again later."
                : "Google rejected the voice session. Check the server key and Gemini Live access.",
          },
          response.status === 429 ? 429 : 502,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let text = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 16_000) throw new Error();
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const token = JSON.parse(text)?.name;
      if (
        typeof token !== "string" ||
        !token.startsWith("auth_tokens/") ||
        token.length > 4096
      )
        throw new Error();
      return reply({ token, setup: voiceSetup });
    } catch {
      return reply(
        { error: "The voice session could not be opened. Try again." },
        502,
      );
    }
  };
}
