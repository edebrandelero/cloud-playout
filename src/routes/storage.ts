import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { loadSecurityConfig } from "../security/config.js";
import {
  deleteStoredFile,
  getStoredFile,
  listStoredFiles,
  saveUploadedFile,
} from "../storage/index.js";

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  const config = loadSecurityConfig();

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
    },
  });

  await app.register(async (uploadApp) => {
    await uploadApp.register(rateLimit, {
      max: config.uploadRateLimitMax,
      timeWindow: config.rateLimitWindowMs,
      errorResponseBuilder: (_request, context) => ({
        error: "Upload rate limit exceeded",
        retryAfter: context.after,
      }),
    });

    uploadApp.post("/storage/upload", async (request, reply) => {
      const data = await request.file();

      if (!data) {
        reply.code(400).send({ error: "No file provided" });
        return;
      }

      const stored = await saveUploadedFile(data.file, data.filename);
      reply.code(201);
      return stored;
    });
  });

  app.get("/storage", async () => listStoredFiles());

  app.get<{ Params: { filename: string } }>(
    "/storage/:filename",
    async (request) => getStoredFile(request.params.filename),
  );

  app.delete<{ Params: { filename: string } }>(
    "/storage/:filename",
    async (request, reply) => {
      deleteStoredFile(request.params.filename);
      reply.code(204);
    },
  );
}
