import { loadSecurityConfig } from "./config.js";
import {
  assertUuid,
  sanitizeText,
  validateAssetPath,
  validateOptionalText,
  validateRtmpUrl,
} from "./validate.js";
import type { CreateAsset, CreateChannel, CreatePlaylist, UpdateAsset, UpdateChannel } from "../types.js";

export function parseChannelInput(body: CreateChannel): CreateChannel {
  const config = loadSecurityConfig();

  return {
    name: sanitizeText(body.name, config.maxNameLength, "Name"),
    description: validateOptionalText(body.description, config.maxDescriptionLength, "Description"),
    outputUrl: validateRtmpUrl(body.outputUrl),
  };
}

export function parseChannelUpdate(body: UpdateChannel): UpdateChannel {
  const config = loadSecurityConfig();
  const result: UpdateChannel = {};

  if (body.name !== undefined) {
    result.name = sanitizeText(body.name, config.maxNameLength, "Name");
  }
  if (body.description !== undefined) {
    result.description = validateOptionalText(
      body.description,
      config.maxDescriptionLength,
      "Description",
    );
  }
  if (body.outputUrl !== undefined) {
    result.outputUrl = validateRtmpUrl(body.outputUrl);
  }

  return result;
}

export function parseAssetInput(body: CreateAsset): CreateAsset {
  const config = loadSecurityConfig();

  return {
    name: sanitizeText(body.name, config.maxNameLength, "Name"),
    path: validateAssetPath(body.path),
    type: body.type === "audio" ? "audio" : "video",
    duration:
      body.duration !== undefined
        ? validateDuration(body.duration)
        : undefined,
  };
}

export function parseAssetUpdate(body: UpdateAsset): UpdateAsset {
  const config = loadSecurityConfig();
  const result: UpdateAsset = {};

  if (body.name !== undefined) {
    result.name = sanitizeText(body.name, config.maxNameLength, "Name");
  }
  if (body.path !== undefined) {
    result.path = validateAssetPath(body.path);
  }
  if (body.type !== undefined) {
    result.type = body.type === "audio" ? "audio" : "video";
  }
  if (body.duration !== undefined) {
    result.duration = validateDuration(body.duration);
  }

  return result;
}

export function parsePlaylistInput(body: CreatePlaylist): CreatePlaylist {
  const config = loadSecurityConfig();
  assertUuid(body.channelId, "channelId");

  return {
    channelId: body.channelId,
    name: sanitizeText(body.name, config.maxNameLength, "Name"),
  };
}

export function parsePlaylistName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const config = loadSecurityConfig();
  return sanitizeText(name, config.maxNameLength, "Name");
}

export function parseUuidParam(value: string, label = "id"): string {
  assertUuid(value, label);
  return value;
}

function validateDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 86_400) {
    throw new Error("Invalid duration");
  }
  return Math.round(value);
}

export function isValidationError(message: string): boolean {
  const patterns = [
    " is required",
    " exceeds maximum",
    " contains invalid",
    "Invalid ",
    "Unsupported ",
    "Empty file",
    "No file provided",
    "File exceeds",
    "Too many requests",
    "Upload rate limit",
  ];

  return patterns.some((p) => message.includes(p));
}
