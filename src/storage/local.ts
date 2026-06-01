import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";
import { loadEngineConfig } from "../engine/config.js";
import {
  assetTypeFromExtension,
  detectExtensionFromBuffer,
  getExtension,
  validateStorageFilename,
} from "../security/validate.js";
import { loadSecurityConfig } from "../security/config.js";

export interface StoredFile {
  filename: string;
  path: string;
  size: number;
  type: "video" | "audio";
  createdAt: string;
}

const ALLOWED_EXT = [".mp4", ".mov", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".aac"];

export const UPLOAD_MAGIC_BYTES = 16;

function mediaRoot(): string {
  return loadEngineConfig().mediaRoot;
}

function ensureMediaRoot(): void {
  mkdirSync(mediaRoot(), { recursive: true });
}

export function listStoredFiles(): StoredFile[] {
  ensureMediaRoot();

  return readdirSync(mediaRoot())
    .filter((name) => !name.startsWith("."))
    .map((filename) => {
      const filePath = resolve(mediaRoot(), filename);
      const stats = statSync(filePath);
      if (!stats.isFile()) return null;

      return {
        filename,
        path: filename,
        size: stats.size,
        type: assetTypeFromExtension(getExtension(filename)),
        createdAt: stats.birthtime.toISOString(),
      };
    })
    .filter((file): file is StoredFile => file !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getStoredFile(filename: string): StoredFile {
  const safeName = validateStorageFilename(filename);
  const filePath = resolve(mediaRoot(), safeName);

  if (!filePath.startsWith(resolve(mediaRoot()))) {
    throw new Error("Invalid filename");
  }

  if (!existsSync(filePath)) {
    throw new Error("File not found");
  }

  const stats = statSync(filePath);
  return {
    filename: safeName,
    path: safeName,
    size: stats.size,
    type: assetTypeFromExtension(getExtension(safeName)),
    createdAt: stats.birthtime.toISOString(),
  };
}

export async function saveUploadedFile(
  stream: AsyncIterable<Buffer>,
  originalFilename: string,
): Promise<StoredFile> {
  ensureMediaRoot();
  const config = loadSecurityConfig();
  const iterator = stream[Symbol.asyncIterator]();

  let headerBuffer = Buffer.alloc(0);
  let totalSize = 0;

  while (headerBuffer.length < UPLOAD_MAGIC_BYTES) {
    const next = await iterator.next();
    if (next.done) break;

    totalSize += next.value.length;
    if (totalSize > config.maxUploadBytes) {
      throw new Error("File exceeds maximum upload size");
    }

    headerBuffer = Buffer.concat([headerBuffer, next.value]);
  }

  if (headerBuffer.length === 0) {
    throw new Error("Empty file");
  }

  const declaredExt = getExtension(originalFilename);
  const detectedExt = detectExtensionFromBuffer(headerBuffer);
  const ext = detectedExt ?? declaredExt;

  if (!ext || !ALLOWED_EXT.includes(ext)) {
    throw new Error("Unsupported or unrecognized media file");
  }

  const filename = `${randomUUID()}${ext}`;
  const filePath = resolve(mediaRoot(), filename);
  const writeStream = createWriteStream(filePath, { flags: "wx" });

  try {
    if (!writeStream.write(headerBuffer)) {
      await once(writeStream, "drain");
    }

    while (true) {
      const next = await iterator.next();
      if (next.done) break;

      totalSize += next.value.length;
      if (totalSize > config.maxUploadBytes) {
        writeStream.destroy();
        unlinkSync(filePath);
        throw new Error("File exceeds maximum upload size");
      }

      if (!writeStream.write(next.value)) {
        await once(writeStream, "drain");
      }
    }

    writeStream.end();
    await once(writeStream, "finish");
  } catch (error) {
    writeStream.destroy();
    if (existsSync(filePath)) unlinkSync(filePath);
    throw error;
  }

  return {
    filename,
    path: filename,
    size: totalSize,
    type: assetTypeFromExtension(ext),
    createdAt: new Date().toISOString(),
  };
}

export function deleteStoredFile(filename: string): void {
  const safeName = validateStorageFilename(filename);
  const filePath = resolve(mediaRoot(), safeName);

  if (!filePath.startsWith(resolve(mediaRoot()))) {
    throw new Error("Invalid filename");
  }

  if (!existsSync(filePath)) {
    throw new Error("File not found");
  }

  unlinkSync(filePath);
}
