import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.EXPORT_QA_PORT ?? 4174);
const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "artifacts", process.env.EXPORT_QA_SUBDIR ?? "rebuild");
await mkdir(outputDirectory, { recursive: true });

function send(response, status, body = "") {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Filename",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    send(response, 204);
    return;
  }
  if (request.method !== "POST" || request.url !== "/artifact") {
    send(response, 404, "not found");
    return;
  }
  const rawName = request.headers["x-filename"];
  const filename = typeof rawName === "string" ? path.basename(rawName) : "unnamed.bin";
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    try {
      const bytes = Buffer.concat(chunks);
      await writeFile(path.join(outputDirectory, filename), bytes);
      process.stdout.write(`saved ${filename} ${bytes.length}\n`);
      send(response, 200, "saved");
    } catch (error) {
      send(response, 500, error instanceof Error ? error.message : String(error));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`export QA receiver http://127.0.0.1:${port}\n`);
});
