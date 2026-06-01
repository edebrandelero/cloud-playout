import { spawn } from "node:child_process";
import { loadEngineConfig, resolveMediaPath } from "./config.js";

export function probeDuration(assetPath: string): Promise<number | null> {
  const config = loadEngineConfig();

  return new Promise((resolve) => {
    const inputPath = resolveMediaPath(config.mediaRoot, assetPath);
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ];

    const child = spawn(config.ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const seconds = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(seconds) ? Math.ceil(seconds) : null);
    });

    child.on("error", () => resolve(null));
  });
}
