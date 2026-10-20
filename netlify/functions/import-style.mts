import type { Config } from "@netlify/functions";
import { createUrlImportHandler } from "../../server/url-import-handler.ts";
import { importWebsite } from "../../server/extract-style.ts";

export const config: Config = {
  path: "/api/import-style",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
export function createHandler(importer = importWebsite) {
  return createUrlImportHandler(importer);
}
export default createHandler();
