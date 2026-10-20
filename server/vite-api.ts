import { Readable } from "node:stream";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import handler from "../netlify/functions/import-style.mts";

export function styleApi(): Plugin {
  function configure(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split("?")[0] !== "/api/import-style") return next();
      try {
        const init: RequestInit & { duplex?: "half" } = {
          method: req.method,
          headers: new Headers(req.headers as Record<string, string>),
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
          init.duplex = "half";
        }
        const response = await handler(
          new Request(`http://${req.headers.host}/api/import-style`, init),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "The local style importer could not complete this request.",
          }),
        );
      }
    });
  }
  return {
    name: "formlane-style-api",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
