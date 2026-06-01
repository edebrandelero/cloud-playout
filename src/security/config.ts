export interface SecurityConfig {
  apiKey: string | null;
  requireAuth: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  uploadRateLimitMax: number;
  corsOrigins: string[];
  maxBodyBytes: number;
  maxUploadBytes: number;
  maxNameLength: number;
  maxDescriptionLength: number;
}

export function loadSecurityConfig(): SecurityConfig {
  const apiKey = process.env.API_KEY?.trim() || null;
  const nodeEnv = process.env.NODE_ENV ?? "development";

  return {
    apiKey,
    requireAuth: nodeEnv === "production" ? true : process.env.REQUIRE_AUTH !== "false",
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 100,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    uploadRateLimitMax: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 10,
    corsOrigins: (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES) || 1_048_576,
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 524_288_000,
    maxNameLength: 120,
    maxDescriptionLength: 500,
  };
}

export function isPublicPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;

  if (path === "/health") return true;
  if (/^\/channels\/[0-9a-f-]{36}\/hls\//i.test(path)) return true;

  return false;
}
