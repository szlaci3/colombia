import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { websiteApi } from "./server/vite-api.ts";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), ["GEMINI_", "FORMLANE_"]);
  for (const key of [
    "GEMINI_API_KEY",
    "FORMLANE_ASSISTANT_ENABLED",
    "FORMLANE_ASSISTANT_MODEL",
  ])
    if (process.env[key] === undefined && environment[key] !== undefined)
      process.env[key] = environment[key];
  return {
    plugins: [react(), websiteApi()],
    test: {
      environment: "node",
      include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
      restoreMocks: true,
    },
  };
});
