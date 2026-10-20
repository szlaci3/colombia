import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { websiteApi } from "./server/vite-api.ts";

export default defineConfig({
  plugins: [react(), websiteApi()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    restoreMocks: true,
  },
});
