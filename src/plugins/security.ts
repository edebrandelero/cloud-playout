import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { isPublicPath, loadSecurityConfig, verifyApiKey, AuthError } from "../security/index.js";

async function securityPlugin(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const config = loadSecurityConfig();

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    allowList: (request) => isPublicPath(request.url),
    errorResponseBuilder: (_request, context) => ({
      error: "Too many requests",
      retryAfter: context.after,
    }),
  });

  app.addHook("onRequest", async (request, reply) => {
    if (isPublicPath(request.url)) return;

    try {
      verifyApiKey(request);
    } catch (error) {
      if (error instanceof AuthError) {
        reply.code(error.message === "Invalid API key" ? 401 : 503).send({ error: error.message });
        return;
      }
      throw error;
    }
  });

  if (config.requireAuth && !config.apiKey) {
    app.log.warn("REQUIRE_AUTH is enabled but API_KEY is not set — protected routes will fail");
  }
}

export default fp(securityPlugin, { name: "security-plugin" });
