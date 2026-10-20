import type { Config } from "@netlify/functions";
import { createAssistantHandler } from "../../server/assistant.ts";

export const config: Config = {
  path: "/api/assistant",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
export default createAssistantHandler();
