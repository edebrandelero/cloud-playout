import Fastify from "fastify";
import { closeDatabase, initDatabase } from "./db/index.js";
import { getDatabasePath } from "./db/config.js";
import { ffmpegEngine, loadEngineConfig } from "./engine/index.js";
import securityPlugin from "./plugins/security.js";
import staticPlugin from "./plugins/static.js";
import { assetRoutes } from "./routes/assets.js";
import { channelRoutes } from "./routes/channels.js";
import { hlsRoutes } from "./routes/hls.js";
import { playlistRoutes } from "./routes/playlists.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { storageRoutes } from "./routes/storage.js";
import { isValidationError, loadSecurityConfig } from "./security/index.js";

const PORT = Number(process.env.PORT) || 3000;
const securityConfig = loadSecurityConfig();

initDatabase();

const app = Fastify({
  logger: true,
  bodyLimit: securityConfig.maxBodyBytes,
});

app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  const text = typeof body === "string" ? body : body.toString();

  if (text === "") {
    done(null, {});
    return;
  }

  try {
    done(null, JSON.parse(text));
  } catch (error) {
    done(error as Error, undefined);
  }
});

app.get("/health", async () => {
  const config = loadEngineConfig();
  return {
    status: "ok",
    service: "cloud-playout",
    engine: config.mode,
    auth: securityConfig.requireAuth,
    database: getDatabasePath(),
  };
});

app.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : "Internal server error";

  if (message.endsWith("not found") || message === "File not found") {
    reply.code(404).send({ error: message });
    return;
  }

  if (message === "Asset already in playlist" || message.includes("UNIQUE constraint")) {
    reply.code(409).send({
      error: message.includes("UNIQUE") ? "Resource already exists" : message,
    });
    return;
  }

  if (message === "Too many requests" || message === "Upload rate limit exceeded") {
    reply.code(429).send({ error: message });
    return;
  }

  const clientErrors = [
    "Playlist is empty",
    "Playlist does not belong to channel",
    "Playout is not active",
    "Playout is already paused",
    "Playout is not paused",
  ];

  if (clientErrors.includes(message) || isValidationError(message)) {
    reply.code(400).send({ error: message });
    return;
  }

  if (message === "Forbidden" || message === "Invalid HLS filename") {
    reply.code(403).send({ error: message });
    return;
  }

  app.log.error(error);
  reply.code(500).send({ error: "Internal server error" });
});

await app.register(securityPlugin);
await app.register(channelRoutes);
await app.register(assetRoutes);
await app.register(playlistRoutes);
await app.register(schedulerRoutes);
await app.register(storageRoutes);
await app.register(hlsRoutes);
await app.register(staticPlugin);

const shutdown = async () => {
  ffmpegEngine.stopAll();
  closeDatabase();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
