import { Readable } from "node:stream";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import handler from "../netlify/functions/import-style.mts";
import contentHandler from "../netlify/functions/import-content.mts";
import assistantHandler from "../netlify/functions/assistant.mts";
import voiceHandler from "../netlify/functions/voice-token.mts";

export function websiteApi(): Plugin {
  function configure(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split("?")[0];
      const route =
        path === "/api/import-style"
          ? handler
          : path === "/api/import-content"
            ? contentHandler
            : path === "/api/assistant"
              ? assistantHandler
              : path === "/api/voice-token"
                ? voiceHandler
                : null;
      if (!route) return next();
      try {
        const init: RequestInit & { duplex?: "half" } = {
          method: req.method,
          headers: new Headers(req.headers as Record<string, string>),
        };
        if (
          req.method !== "GET" &&
          req.method !== "HEAD" &&
          (req.headers["transfer-encoding"] ||
            Number(req.headers["content-length"]) > 0)
        ) {
          init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
          init.duplex = "half";
        }
        const response = await route(
          new Request(`http://${req.headers.host}${path}`, init),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "The local website importer could not complete this request.",
          }),
        );
      }
    });
  }
  return {
    name: "formlane-website-api",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
