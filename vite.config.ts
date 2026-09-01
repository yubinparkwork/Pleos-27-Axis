import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ command }) => ({
  base: command === "build" && !process.env.VERCEL ? "/Pleos-27-Axis/" : "/",
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
}));
