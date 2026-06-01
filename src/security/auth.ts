import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { loadSecurityConfig } from "./config.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function extractApiKey(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }

  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string") {
    return apiKeyHeader.trim();
  }

  return null;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export function verifyApiKey(request: FastifyRequest): void {
  const config = loadSecurityConfig();

  if (!config.requireAuth) return;

  if (!config.apiKey) {
    throw new AuthError("API key not configured on server");
  }

  const provided = extractApiKey(request);
  if (!provided) {
    throw new AuthError("Missing API key");
  }

  if (!safeCompare(provided, config.apiKey)) {
    throw new AuthError("Invalid API key");
  }
}

export function authHook(request: FastifyRequest, reply: FastifyReply): void {
  verifyApiKey(request);
}
