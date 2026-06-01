import type { AssetType } from "../types.js";

export type PlayoutStatus = "idle" | "playing" | "paused" | "stopped";

export interface PlayoutQueueItem {
  order: number;
  assetId: string;
  assetName: string;
  path: string;
  type: AssetType;
  duration: number;
}

export interface PlayoutState {
  channelId: string;
  playlistId: string | null;
  playlistName: string | null;
  status: PlayoutStatus;
  currentIndex: number;
  currentItem: PlayoutQueueItem | null;
  queue: PlayoutQueueItem[];
  startedAt: string | null;
  itemStartedAt: string | null;
  remainingMs: number | null;
  engineMode: "ffmpeg" | "simulation";
  outputTarget: string | null;
}

export type StartPlayout = {
  playlistId: string;
};
