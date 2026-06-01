import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type EngineMode = "ffmpeg" | "simulation";

export interface EngineConfig {
  mode: EngineMode;
  ffmpegPath: string;
  ffprobePath: string;
  mediaRoot: string;
  hlsOutputDir: string;
}

function resolveMode(): EngineMode {
  const mode = process.env.PLAYOUT_ENGINE?.toLowerCase();
  if (mode === "simulation") return "simulation";
  return "ffmpeg";
}

export function loadEngineConfig(): EngineConfig {
  const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";
  const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
  const mediaRoot = resolve(process.env.MEDIA_ROOT ?? "./media");
  const hlsOutputDir = resolve(process.env.HLS_OUTPUT_DIR ?? "./output/hls");

  return {
    mode: resolveMode(),
    ffmpegPath,
    ffprobePath,
    mediaRoot,
    hlsOutputDir,
  };
}

export function resolveMediaPath(mediaRoot: string, assetPath: string): string {
  if (assetPath.startsWith("/") || /^[A-Za-z]:\\/.test(assetPath)) {
    return assetPath;
  }
  return resolve(mediaRoot, assetPath);
}

export function isRtmpOutput(outputUrl: string): boolean {
  return /^rtmp(s)?:\/\//i.test(outputUrl);
}

export function hlsPlaylistPath(hlsOutputDir: string, channelId: string): string {
  return resolve(hlsOutputDir, channelId, "stream.m3u8");
}

export function hlsPublicUrl(channelId: string): string {
  return `/channels/${channelId}/hls/stream.m3u8`;
}

export function mediaFileExists(mediaRoot: string, assetPath: string): boolean {
  return existsSync(resolveMediaPath(mediaRoot, assetPath));
}
