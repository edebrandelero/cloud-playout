import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { loadEngineConfig } from "../engine/config.js";
import { parseUuidParam } from "../security/parse.js";
import { store } from "../store.js";

const CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function validateHlsFilename(filename: string): string {
  if (filename === "stream.m3u8") return filename;
  if (/^segment_\d+\.ts$/.test(filename)) return filename;
  throw new Error("Invalid HLS filename");
}

export async function hlsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { channelId: string; file: string } }>(
    "/channels/:channelId/hls/:file",
    async (request, reply) => {
      parseUuidParam(request.params.channelId, "channelId");
      store.getChannel(request.params.channelId);
      validateHlsFilename(request.params.file);

      const config = loadEngineConfig();
      const channelDir = resolve(config.hlsOutputDir, request.params.channelId);
      const filePath = resolve(channelDir, request.params.file);

      if (!filePath.startsWith(channelDir)) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }

      if (!existsSync(filePath)) {
        reply.code(404).send({ error: "HLS file not found" });
        return;
      }

      reply.type(contentTypeFor(request.params.file));
      return reply.send(createReadStream(filePath));
    },
  );
}
