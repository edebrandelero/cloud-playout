import { randomUUID } from "node:crypto";
import type {
  AddPlaylistItem,
  Asset,
  Channel,
  CreateAsset,
  CreateChannel,
  CreatePlaylist,
  Playlist,
  PlaylistItem,
  UpdateAsset,
  UpdateChannel,
  UpdatePlaylist,
} from "./types.js";

const channels = new Map<string, Channel>();
const assets = new Map<string, Asset>();
const playlists = new Map<string, Playlist>();

function now(): string {
  return new Date().toISOString();
}

function notFound(resource: string): Error {
  return new Error(`${resource} not found`);
}

export const store = {
  listChannels(): Channel[] {
    return [...channels.values()];
  },

  getChannel(id: string): Channel {
    const channel = channels.get(id);
    if (!channel) throw notFound("Channel");
    return channel;
  },

  createChannel(data: CreateChannel): Channel {
    const timestamp = now();
    const channel: Channel = {
      id: randomUUID(),
      name: data.name,
      description: data.description,
      outputUrl: data.outputUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    channels.set(channel.id, channel);
    return channel;
  },

  updateChannel(id: string, data: UpdateChannel): Channel {
    const channel = this.getChannel(id);
    const updated: Channel = {
      ...channel,
      ...data,
      id: channel.id,
      createdAt: channel.createdAt,
      updatedAt: now(),
    };
    channels.set(id, updated);
    return updated;
  },

  deleteChannel(id: string): void {
    if (!channels.delete(id)) throw notFound("Channel");

    for (const [playlistId, playlist] of playlists) {
      if (playlist.channelId === id) {
        playlists.delete(playlistId);
      }
    }
  },

  listAssets(): Asset[] {
    return [...assets.values()];
  },

  getAsset(id: string): Asset {
    const asset = assets.get(id);
    if (!asset) throw notFound("Asset");
    return asset;
  },

  createAsset(data: CreateAsset): Asset {
    const asset: Asset = {
      id: randomUUID(),
      name: data.name,
      path: data.path,
      type: data.type,
      duration: data.duration,
      createdAt: now(),
    };
    assets.set(asset.id, asset);
    return asset;
  },

  updateAsset(id: string, data: UpdateAsset): Asset {
    const asset = this.getAsset(id);
    const updated: Asset = {
      ...asset,
      ...data,
      id: asset.id,
      createdAt: asset.createdAt,
    };
    assets.set(id, updated);
    return updated;
  },

  deleteAsset(id: string): void {
    if (!assets.delete(id)) throw notFound("Asset");

    for (const [playlistId, playlist] of playlists) {
      const items = playlist.items.filter((item) => item.assetId !== id);
      if (items.length !== playlist.items.length) {
        playlists.set(playlistId, {
          ...playlist,
          items: reindexItems(items),
          updatedAt: now(),
        });
      }
    }
  },

  listPlaylists(channelId?: string): Playlist[] {
    const all = [...playlists.values()];
    return channelId ? all.filter((p) => p.channelId === channelId) : all;
  },

  getPlaylist(id: string): Playlist {
    const playlist = playlists.get(id);
    if (!playlist) throw notFound("Playlist");
    return playlist;
  },

  createPlaylist(data: CreatePlaylist): Playlist {
    this.getChannel(data.channelId);
    const timestamp = now();
    const playlist: Playlist = {
      id: randomUUID(),
      channelId: data.channelId,
      name: data.name,
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    playlists.set(playlist.id, playlist);
    return playlist;
  },

  updatePlaylist(id: string, data: UpdatePlaylist): Playlist {
    const playlist = this.getPlaylist(id);
    const updated: Playlist = {
      ...playlist,
      ...data,
      id: playlist.id,
      channelId: playlist.channelId,
      createdAt: playlist.createdAt,
      updatedAt: now(),
    };
    playlists.set(id, updated);
    return updated;
  },

  deletePlaylist(id: string): void {
    if (!playlists.delete(id)) throw notFound("Playlist");
  },

  addPlaylistItem(playlistId: string, data: AddPlaylistItem): Playlist {
    this.getAsset(data.assetId);
    const playlist = this.getPlaylist(playlistId);

    if (playlist.items.some((item) => item.assetId === data.assetId)) {
      throw new Error("Asset already in playlist");
    }

    const order =
      data.order ??
      (playlist.items.length > 0
        ? Math.max(...playlist.items.map((item) => item.order)) + 1
        : 0);

    const updated: Playlist = {
      ...playlist,
      items: [...playlist.items, { assetId: data.assetId, order }],
      updatedAt: now(),
    };
    playlists.set(playlistId, updated);
    return updated;
  },

  removePlaylistItem(playlistId: string, assetId: string): Playlist {
    const playlist = this.getPlaylist(playlistId);
    const items = playlist.items.filter((item) => item.assetId !== assetId);

    if (items.length === playlist.items.length) {
      throw notFound("Playlist item");
    }

    const updated: Playlist = {
      ...playlist,
      items: reindexItems(items),
      updatedAt: now(),
    };
    playlists.set(playlistId, updated);
    return updated;
  },
};

function reindexItems(items: PlaylistItem[]): PlaylistItem[] {
  return items
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}
