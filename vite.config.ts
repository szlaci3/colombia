import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { styleApi } from "./server/vite-api.ts";

export default defineConfig({
  plugins: [react(), styleApi()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    restoreMocks: true,
  },
});
