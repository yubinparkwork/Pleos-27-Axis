import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from 'node:crypto';
import path from "node:path";

const STUDIO_STATE_ENDPOINT = "/__pleos/studio-state";
const OPTICAL_STATE_ENDPOINT = '/__pleos/optical-state';

function localStudioStatePlugin() {
  let root = process.cwd();
  let enabled = false;
  const opticalWrites = new Map<string, Promise<void>>();
  return {
    name: "pleos-local-studio-state",
    configResolved(config: { root: string; server: { port?: number } }) {
      root = config.root;
      enabled = (config.server.port ?? 5173) === 5173 || Boolean(process.env.PLEOS_OPTICAL_STATE_TEST_DIR);
    },
    configureServer(server: { middlewares: { use(handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, next: () => void) => void): void } }) {
      if (!enabled) return;
      const directory = process.env.PLEOS_OPTICAL_STATE_TEST_DIR ?? path.join(root, ".pleos");
      const filename = path.join(directory, "studio-state.json");
      server.middlewares.use((request, response, next) => {
        const parsed = new URL(request.url ?? '/', 'http://localhost');
        if (parsed.pathname === OPTICAL_STATE_ENDPOINT) {
          const key = parsed.searchParams.get('key');
          if (!key || !/^pleos-optical-studio-v1(?::[a-z0-9:-]+)?$/.test(key)) {
            response.statusCode = 400; response.end(JSON.stringify({ error: 'Invalid optical state key' })); return;
          }
          const opticalDirectory = path.join(directory, 'optical-state');
          const opticalFile = path.join(opticalDirectory, `${encodeURIComponent(key)}.json`);
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (request.method === 'GET') {
            void readFile(opticalFile, 'utf8').then(value => { response.statusCode = 200; response.end(value); })
              .catch(() => { response.statusCode = 204; response.end(); });
            return;
          }
          if (request.method === 'PUT') {
            const chunks: Buffer[] = [];
            let size = 0;
            request.on('data', (chunk: Buffer) => {
              size += chunk.byteLength;
              // Named artboards carry scene snapshots; keep a bounded but
              // sufficient limit without treating the payload as source code.
              if (size > 512 * 1024) request.destroy(new Error('Optical state payload is too large.'));
              else chunks.push(chunk);
            });
            request.on('end', () => {
              const previousWrite = opticalWrites.get(key) ?? Promise.resolve();
              const write = previousWrite.catch(() => undefined).then(async () => {
                const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { version?: number; updatedAt?: number; migration?: boolean; state?: unknown };
                if (value.version !== 1 || !Number.isFinite(value.updatedAt) || !value.state || typeof value.state !== 'object' || Array.isArray(value.state)) throw new Error('Invalid optical state payload');
                const previous = await readFile(opticalFile, 'utf8').then(text => JSON.parse(text) as { updatedAt?: number }).catch(() => null);
                if (previous && (value.migration || (previous.updatedAt ?? 0) > value.updatedAt!)) {
                  response.statusCode = 409; response.end(JSON.stringify(previous)); return;
                }
                await mkdir(opticalDirectory, { recursive: true });
                const temporary = `${opticalFile}.${randomUUID()}.tmp`;
                await writeFile(temporary, JSON.stringify({ version: 1, updatedAt: value.updatedAt, state: value.state }), 'utf8');
                await rename(temporary, opticalFile);
                response.statusCode = 204; response.end();
              });
              opticalWrites.set(key, write);
              void write.catch(error => { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); })
                .finally(() => { if (opticalWrites.get(key) === write) opticalWrites.delete(key); });
            });
            return;
          }
          response.statusCode = 405; response.end(JSON.stringify({ error: 'Method not allowed' })); return;
        }
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
