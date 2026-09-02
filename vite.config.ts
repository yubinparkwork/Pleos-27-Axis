import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const STUDIO_STATE_ENDPOINT = "/__pleos/studio-state";

function localStudioStatePlugin() {
  let root = process.cwd();
  let enabled = false;
  return {
    name: "pleos-local-studio-state",
    configResolved(config: { root: string; server: { port?: number } }) {
      root = config.root;
      enabled = (config.server.port ?? 5173) === 5173;
    },
    configureServer(server: { middlewares: { use(handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, next: () => void) => void): void } }) {
      if (!enabled) return;
      const directory = path.join(root, ".pleos");
      const filename = path.join(directory, "studio-state.json");
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== STUDIO_STATE_ENDPOINT) { next(); return; }
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (request.method === "GET") {
          void readFile(filename, "utf8").then((value) => { response.statusCode = 200; response.end(value); }).catch(() => { response.statusCode = 204; response.end(); });
          return;
        }
        if (request.method === "PUT") {
          const chunks: Buffer[] = [];
          let size = 0;
          request.on("data", (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > 2 * 1024 * 1024) request.destroy(new Error("Studio state payload is too large."));
            else chunks.push(chunk);
          });
          request.on("end", () => {
            void (async () => {
              const text = Buffer.concat(chunks).toString("utf8");
              JSON.parse(text);
              await mkdir(directory, { recursive: true });
              const temporary = `${filename}.tmp`;
              await writeFile(temporary, text, "utf8");
              await rename(temporary, filename);
              response.statusCode = 204;
              response.end();
            })().catch((error) => { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); });
          });
          return;
        }
        response.statusCode = 405;
        response.end(JSON.stringify({ error: "Method not allowed" }));
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" && !process.env.VERCEL ? "/Pleos-27-Axis/" : "/",
  plugins: [localStudioStatePlugin(), svelte()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
}));
