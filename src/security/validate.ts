const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RTMP_RE = /^rtmps?:\/\/[^\s/$.?#][^\s]*$/i;

const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

const ALLOWED_MEDIA_EXT = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
]);

const MAGIC_SIGNATURES: Array<{ ext: string; bytes: number[]; offset?: number }> = [
  { ext: ".mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { ext: ".mkv", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { ext: ".webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { ext: ".mp3", bytes: [0x49, 0x44, 0x33] },
  { ext: ".mp3", bytes: [0xff, 0xfb] },
  { ext: ".wav", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertUuid(value: string, label = "id"): void {
  if (!isUuid(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

export function sanitizeText(value: string, maxLength: number, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${label} exceeds maximum length`);
  }

  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(trimmed)) {
    throw new Error(`${label} contains invalid characters`);
  }

  return trimmed;
}

export function validateOptionalText(
  value: string | undefined,
  maxLength: number,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  return sanitizeText(value, maxLength, label);
}

export function validateRtmpUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!RTMP_RE.test(trimmed)) {
    throw new Error("Invalid output URL");
  }

  if (trimmed.length > 2048) {
    throw new Error("Output URL exceeds maximum length");
  }

  return trimmed;
}

export function validateAssetPath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 255) {
    throw new Error("Invalid asset path");
  }

  if (trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
    throw new Error("Invalid asset path");
  }

  if (!SAFE_FILENAME_RE.test(trimmed)) {
    throw new Error("Invalid asset path");
  }

  const ext = getExtension(trimmed);
  if (!ALLOWED_MEDIA_EXT.has(ext)) {
    throw new Error("Unsupported media type");
  }

  return trimmed;
}

export function validateStorageFilename(value: string): string {
  const trimmed = value.trim();

  if (!SAFE_FILENAME_RE.test(trimmed)) {
    throw new Error("Invalid filename");
  }

  const ext = getExtension(trimmed);
  if (!ALLOWED_MEDIA_EXT.has(ext)) {
    throw new Error("Unsupported media type");
  }

  return trimmed;
}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

export function detectExtensionFromBuffer(buffer: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    const match = sig.bytes.every((byte, i) => buffer[offset + i] === byte);
    if (match) return sig.ext;
  }

  return null;
}

export function assetTypeFromExtension(ext: string): "video" | "audio" {
  if ([".mp3", ".wav", ".m4a", ".aac"].includes(ext)) {
    return "audio";
  }
  return "video";
}
