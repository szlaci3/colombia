import type { Config } from "@netlify/functions";
import { createVoiceHandler } from "../../server/voice.ts";

export const config: Config = {
  path: "/api/voice-token",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
export default createVoiceHandler();
