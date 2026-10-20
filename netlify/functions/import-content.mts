import type { Config } from "@netlify/functions";
import { createUrlImportHandler } from "../../server/url-import-handler.ts";
import { importContent } from "../../server/extract-content.ts";

export const config: Config = {
  path: "/api/import-content",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
export default createUrlImportHandler(importContent);
