import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  hlsPlaylistPath,
  hlsPublicUrl,
  isRtmpOutput,
  loadEngineConfig,
  resolveMediaPath,
  type EngineConfig,
  type EngineMode,
} from "./config.js";

export type EngineOutputTarget = {
  type: "rtmp" | "hls" | "simulation";
  url: string;
};

type ItemEndedCallback = (channelId: string, code: number | null) => void;

interface ActiveProcess {
  process: ChildProcess;
  channelId: string;
  assetPath: string;
  seekSeconds: number;
}

class FfmpegEngine {
  private config: EngineConfig;
  private processes = new Map<string, ActiveProcess>();
  private onItemEnded: ItemEndedCallback | null = null;

  constructor(config: EngineConfig = loadEngineConfig()) {
    this.config = config;
  }

  get mode(): EngineMode {
    return this.config.mode;
  }

  setItemEndedHandler(handler: ItemEndedCallback): void {
    this.onItemEnded = handler;
  }

  resolveOutput(channelId: string, outputUrl?: string): EngineOutputTarget {
    if (this.config.mode === "simulation") {
      return { type: "simulation", url: "simulation" };
    }

    if (outputUrl && isRtmpOutput(outputUrl)) {
      return { type: "rtmp", url: outputUrl };
    }

    const playlist = hlsPlaylistPath(this.config.hlsOutputDir, channelId);
    return { type: "hls", url: hlsPublicUrl(channelId) };
  }

  playItem(
    channelId: string,
    assetPath: string,
    outputUrl: string | undefined,
    seekSeconds = 0,
  ): EngineOutputTarget {
    this.stop(channelId);

    const target = this.resolveOutput(channelId, outputUrl);

    if (target.type === "simulation") {
      console.log(`[ffmpeg] channel=${channelId} simulation mode (no encode)`);
      return target;
    }

    const inputPath = resolveMediaPath(this.config.mediaRoot, assetPath);
    const args = this.buildArgs(channelId, inputPath, target, seekSeconds);

    console.log(
      `[ffmpeg] channel=${channelId} starting: ${this.config.ffmpegPath} ${args.join(" ")}`,
    );

    const child = spawn(this.config.ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.processes.set(channelId, {
      process: child,
      channelId,
      assetPath: inputPath,
      seekSeconds,
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line.includes("Error") || line.includes("error")) {
        console.error(`[ffmpeg] channel=${channelId} ${line}`);
      }
    });

    child.on("close", (code) => {
      const active = this.processes.get(channelId);
      if (active?.process === child) {
        this.processes.delete(channelId);
        this.onItemEnded?.(channelId, code);
      }
    });

    child.on("error", (error) => {
      console.error(`[ffmpeg] channel=${channelId} failed to start: ${error.message}`);
      this.processes.delete(channelId);
      this.onItemEnded?.(channelId, 1);
    });

    return target;
  }

  stop(channelId: string): void {
    const active = this.processes.get(channelId);
    if (!active) return;

    active.process.removeAllListeners("close");
    active.process.kill("SIGTERM");
    this.processes.delete(channelId);
    console.log(`[ffmpeg] channel=${channelId} stopped`);
  }

  stopAll(): void {
    for (const channelId of [...this.processes.keys()]) {
      this.stop(channelId);
    }
  }

  isPlaying(channelId: string): boolean {
    return this.processes.has(channelId);
  }

  private buildArgs(
    channelId: string,
    inputPath: string,
    target: EngineOutputTarget,
    seekSeconds: number,
  ): string[] {
    const args = ["-hide_banner", "-loglevel", "warning", "-re"];

    if (seekSeconds > 0) {
      args.push("-ss", seekSeconds.toFixed(3));
    }

    args.push("-i", inputPath);

    if (target.type === "rtmp") {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-f",
        "flv",
        target.url,
      );
      return args;
    }

    const playlistPath = hlsPlaylistPath(this.config.hlsOutputDir, channelId);
    mkdirSync(dirname(playlistPath), { recursive: true });

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_list_size",
      "6",
      "-hls_flags",
      "delete_segments+append_list",
      "-hls_segment_filename",
      `${dirname(playlistPath)}/segment_%03d.ts`,
      playlistPath,
    );

    return args;
  }
}

export const ffmpegEngine = new FfmpegEngine();
