import type { Config } from "@netlify/functions";
import { ImportError } from "../../server/public-fetch.ts";
import { importWebsite } from "../../server/extract-style.ts";

export const config: Config = {
  path: "/api/import-style",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function createHandler(importer = importWebsite) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return reply({ error: "Use the style importer from Formlane." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply({ error: "Send a JSON request." }, 415);
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "Enter a website URL." }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return reply({ error: "The request is too large." }, 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let input: unknown;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply({ error: "Send a valid website URL." }, 400);
      }
      if (
        !input ||
        typeof input !== "object" ||
        !("url" in input) ||
        typeof input.url !== "string"
      )
        return reply({ error: "Enter a website URL." }, 400);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(12_000),
      ]);
      return reply(await importer(input.url, signal));
    } catch (error) {
      if (error instanceof ImportError)
        return reply({ error: error.message }, error.status);
      return reply(
        {
          error:
            "This website could not be analyzed in time. Try another public HTTPS page.",
        },
        422,
      );
    }
  };
}
export default createHandler();
