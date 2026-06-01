import { store } from "../store.js";
import { ffmpegEngine, loadEngineConfig, mediaFileExists } from "../engine/index.js";
import type { AssetType } from "../types.js";
import type { PlayoutQueueItem, PlayoutState } from "./types.js";

const DEFAULT_ASSET_DURATION_SEC = 10;

interface Session {
  state: PlayoutState;
  timer: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  itemDeadlineAt: number | null;
  useEngineTimer: boolean;
  seekSeconds: number;
}

function now(): string {
  return new Date().toISOString();
}

function idleState(channelId: string): PlayoutState {
  const config = loadEngineConfig();
  return {
    channelId,
    playlistId: null,
    playlistName: null,
    status: "idle",
    currentIndex: -1,
    currentItem: null,
    queue: [],
    startedAt: null,
    itemStartedAt: null,
    remainingMs: null,
    engineMode: config.mode,
    outputTarget: null,
  };
}

class PlayoutScheduler {
  private sessions = new Map<string, Session>();

  constructor() {
    ffmpegEngine.setItemEndedHandler((channelId, code) => {
      if (code === 0 || code === null) {
        this.onEngineItemEnded(channelId);
      } else {
        console.error(`[playout] channel=${channelId} ffmpeg exited with code ${code}`);
        this.onEngineItemEnded(channelId);
      }
    });
  }

  getStatus(channelId: string): PlayoutState {
    store.getChannel(channelId);
    return this.sessions.get(channelId)?.state ?? idleState(channelId);
  }

  start(channelId: string, playlistId: string): PlayoutState {
    const channel = store.getChannel(channelId);
    const playlist = store.getPlaylist(playlistId);

    if (playlist.channelId !== channelId) {
      throw new Error("Playlist does not belong to channel");
    }

    if (playlist.items.length === 0) {
      throw new Error("Playlist is empty");
    }

    this.clearSession(channelId);

    const queue = playlist.items
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        const asset = store.getAsset(item.assetId);
        return toQueueItem(item.order, asset);
      });

    const firstItem = queue[0]!;
    const output = ffmpegEngine.resolveOutput(channelId, channel.outputUrl);

    const state: PlayoutState = {
      channelId,
      playlistId: playlist.id,
      playlistName: playlist.name,
      status: "playing",
      currentIndex: 0,
      currentItem: firstItem,
      queue,
      startedAt: now(),
      itemStartedAt: now(),
      remainingMs: firstItem.duration * 1000,
      engineMode: loadEngineConfig().mode,
      outputTarget: output.url,
    };

    const useEngineTimer = this.shouldUseEngine(channel.outputUrl, firstItem.path);

    this.sessions.set(channelId, {
      state,
      timer: null,
      remainingMs: state.remainingMs!,
      itemDeadlineAt: null,
      useEngineTimer,
      seekSeconds: 0,
    });

    this.playCurrentItem(channelId);

    console.log(
      `[playout] channel=${channelId} started playlist="${playlist.name}" (${queue.length} items) mode=${state.engineMode}`,
    );

    return state;
  }

  pause(channelId: string): PlayoutState {
    const session = this.requireActiveSession(channelId);

    if (session.state.status === "paused") {
      throw new Error("Playout is already paused");
    }

    if (session.state.status !== "playing") {
      throw new Error("Playout is not active");
    }

    this.clearTimer(channelId);
    session.remainingMs = Math.max(0, (session.itemDeadlineAt ?? Date.now()) - Date.now());
    session.itemDeadlineAt = null;

    if (session.useEngineTimer) {
      const itemDurationMs = (session.state.currentItem?.duration ?? 0) * 1000;
      session.seekSeconds += (itemDurationMs - session.remainingMs) / 1000;
      ffmpegEngine.stop(channelId);
    }

    session.state.status = "paused";
    session.state.remainingMs = session.remainingMs;

    console.log(`[playout] channel=${channelId} paused`);
    return session.state;
  }

  resume(channelId: string): PlayoutState {
    const session = this.requireActiveSession(channelId);

    if (session.state.status !== "paused") {
      throw new Error("Playout is not paused");
    }

    session.state.status = "playing";
    session.state.itemStartedAt = now();

    if (session.useEngineTimer) {
      this.startEngineForCurrentItem(channelId);
      this.scheduleWatchdog(channelId);
    } else {
      this.scheduleAdvance(channelId);
    }

    console.log(`[playout] channel=${channelId} resumed`);
    return session.state;
  }

  stop(channelId: string): PlayoutState {
    store.getChannel(channelId);
    const session = this.sessions.get(channelId);

    if (!session || session.state.status === "idle" || session.state.status === "stopped") {
      throw new Error("Playout is not active");
    }

    this.clearSession(channelId);
    const stopped = idleState(channelId);
    stopped.status = "stopped";

    this.sessions.set(channelId, {
      state: stopped,
      timer: null,
      remainingMs: 0,
      itemDeadlineAt: null,
      useEngineTimer: false,
      seekSeconds: 0,
    });

    console.log(`[playout] channel=${channelId} stopped`);
    return stopped;
  }

  skip(channelId: string): PlayoutState {
    const session = this.requireActiveSession(channelId);

    if (session.state.status !== "playing" && session.state.status !== "paused") {
      throw new Error("Playout is not active");
    }

    this.clearTimer(channelId);
    ffmpegEngine.stop(channelId);
    session.seekSeconds = 0;

    if (session.state.status === "paused") {
      session.state.status = "playing";
    }

    this.advance(channelId);
    return session.state;
  }

  removeChannel(channelId: string): void {
    this.clearSession(channelId);
    this.sessions.delete(channelId);
  }

  private onEngineItemEnded(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session || session.state.status !== "playing" || !session.useEngineTimer) {
      return;
    }

    this.clearTimer(channelId);
    session.seekSeconds = 0;
    this.advance(channelId);
  }

  private playCurrentItem(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session?.state.currentItem) return;

    this.logCurrentItem(channelId);

    if (session.useEngineTimer) {
      this.startEngineForCurrentItem(channelId);
    } else {
      this.scheduleAdvance(channelId);
    }
  }

  private startEngineForCurrentItem(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session?.state.currentItem) return;

    const channel = store.getChannel(channelId);
    const item = session.state.currentItem;
    const output = ffmpegEngine.playItem(
      channelId,
      item.path,
      channel.outputUrl,
      session.seekSeconds,
    );

    session.state.outputTarget = output.url;
    session.state.engineMode = loadEngineConfig().mode;

    if (output.type === "simulation") {
      session.useEngineTimer = false;
      this.scheduleAdvance(channelId);
      return;
    }

    session.useEngineTimer = true;
    this.scheduleWatchdog(channelId);
  }

  private scheduleWatchdog(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session?.state.currentItem) return;

    const timeoutMs = session.state.currentItem.duration * 1000 + 5000;
    session.remainingMs = session.state.currentItem.duration * 1000;
    session.state.remainingMs = session.remainingMs;
    session.itemDeadlineAt = Date.now() + session.remainingMs;

    session.timer = setTimeout(() => {
      console.warn(`[playout] channel=${channelId} watchdog timeout, forcing advance`);
      ffmpegEngine.stop(channelId);
      this.advance(channelId);
    }, timeoutMs);
  }

  private shouldUseEngine(outputUrl: string | undefined, assetPath: string): boolean {
    const config = loadEngineConfig();
    if (config.mode === "simulation") return false;
    return mediaFileExists(config.mediaRoot, assetPath);
  }

  private requireActiveSession(channelId: string): Session {
    store.getChannel(channelId);
    const session = this.sessions.get(channelId);

    if (
      !session ||
      session.state.status === "idle" ||
      session.state.status === "stopped"
    ) {
      throw new Error("Playout is not active");
    }

    return session;
  }

  private scheduleAdvance(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session || session.state.status !== "playing") return;

    session.itemDeadlineAt = Date.now() + session.remainingMs;
    session.timer = setTimeout(() => this.advance(channelId), session.remainingMs);
  }

  private advance(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (!session || session.state.status === "idle" || session.state.status === "stopped") {
      return;
    }

    ffmpegEngine.stop(channelId);
    const nextIndex = session.state.currentIndex + 1;

    if (nextIndex >= session.state.queue.length) {
      console.log(`[playout] channel=${channelId} playlist finished`);
      const finished = idleState(channelId);
      this.sessions.set(channelId, {
        state: finished,
        timer: null,
        remainingMs: 0,
        itemDeadlineAt: null,
        useEngineTimer: false,
        seekSeconds: 0,
      });
      return;
    }

    const nextItem = session.state.queue[nextIndex]!;
    const channel = store.getChannel(channelId);

    session.state.currentIndex = nextIndex;
    session.state.currentItem = nextItem;
    session.state.itemStartedAt = now();
    session.state.status = "playing";
    session.remainingMs = nextItem.duration * 1000;
    session.state.remainingMs = session.remainingMs;
    session.seekSeconds = 0;
    session.useEngineTimer = this.shouldUseEngine(channel.outputUrl, nextItem.path);

    this.playCurrentItem(channelId);
  }

  private clearTimer(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (session?.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
  }

  private clearSession(channelId: string): void {
    this.clearTimer(channelId);
    ffmpegEngine.stop(channelId);
  }

  private logCurrentItem(channelId: string): void {
    const session = this.sessions.get(channelId);
    const item = session?.state.currentItem;
    if (!item) return;

    console.log(
      `[playout] channel=${channelId} playing [${session.state.currentIndex + 1}/${session.state.queue.length}] "${item.assetName}" (${item.duration}s)`,
    );
  }
}

function toQueueItem(
  order: number,
  asset: { id: string; name: string; path: string; type: AssetType; duration?: number },
): PlayoutQueueItem {
  return {
    order,
    assetId: asset.id,
    assetName: asset.name,
    path: asset.path,
    type: asset.type,
    duration: asset.duration ?? DEFAULT_ASSET_DURATION_SEC,
  };
}

export const scheduler = new PlayoutScheduler();
