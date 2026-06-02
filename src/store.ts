import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import { getDb } from "./db/index.js";
import type {
  AddPlaylistItem,
  Asset,
  AssetType,
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

interface ChannelRow {
  id: string;
  name: string;
  description: string | null;
  output_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  name: string;
  path: string;
  type: AssetType;
  duration: number | null;
  created_at: string;
}

interface PlaylistRow {
  id: string;
  channel_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface PlaylistItemRow {
  asset_id: string;
  sort_order: number;
}

function now(): string {
  return new Date().toISOString();
}

function notFound(resource: string): Error {
  return new Error(`${resource} not found`);
}

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    outputUrl: row.output_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    type: row.type,
    duration: row.duration ?? undefined,
    createdAt: row.created_at,
  };
}

function loadPlaylistItems(database: Database, playlistId: string): PlaylistItem[] {
  const rows = database
    .prepare(
      `SELECT asset_id, sort_order FROM playlist_items
       WHERE playlist_id = ? ORDER BY sort_order ASC`,
    )
    .all(playlistId) as PlaylistItemRow[];

  return rows.map((row) => ({ assetId: row.asset_id, order: row.sort_order }));
}

function rowToPlaylist(database: Database, row: PlaylistRow): Playlist {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    items: loadPlaylistItems(database, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reindexItems(database: Database, playlistId: string, items: PlaylistItem[]): void {
  const update = database.prepare(
    `UPDATE playlist_items SET sort_order = ? WHERE playlist_id = ? AND asset_id = ?`,
  );

  const reindexed = items
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));

  for (const item of reindexed) {
    update.run(item.order, playlistId, item.assetId);
  }
}

export const store = {
  listChannels(): Channel[] {
    const rows = getDb()
      .prepare(`SELECT * FROM channels ORDER BY created_at DESC`)
      .all() as ChannelRow[];
    return rows.map(rowToChannel);
  },

  getChannel(id: string): Channel {
    const row = getDb().prepare(`SELECT * FROM channels WHERE id = ?`).get(id) as
      | ChannelRow
      | undefined;
    if (!row) throw notFound("Channel");
    return rowToChannel(row);
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

    getDb()
      .prepare(
        `INSERT INTO channels (id, name, description, output_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        channel.id,
        channel.name,
        channel.description ?? null,
        channel.outputUrl ?? null,
        channel.createdAt,
        channel.updatedAt,
      );

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

    getDb()
      .prepare(
        `UPDATE channels SET name = ?, description = ?, output_url = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description ?? null,
        updated.outputUrl ?? null,
        updated.updatedAt,
        id,
      );

    return updated;
  },

  deleteChannel(id: string): void {
    const result = getDb().prepare(`DELETE FROM channels WHERE id = ?`).run(id);
    if (result.changes === 0) throw notFound("Channel");
  },

  listAssets(): Asset[] {
    const rows = getDb()
      .prepare(`SELECT * FROM assets ORDER BY created_at DESC`)
      .all() as AssetRow[];
    return rows.map(rowToAsset);
  },

  getAsset(id: string): Asset {
    const row = getDb().prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as AssetRow | undefined;
    if (!row) throw notFound("Asset");
    return rowToAsset(row);
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

    getDb()
      .prepare(
        `INSERT INTO assets (id, name, path, type, duration, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        asset.id,
        asset.name,
        asset.path,
        asset.type,
        asset.duration ?? null,
        asset.createdAt,
      );

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

    getDb()
      .prepare(`UPDATE assets SET name = ?, path = ?, type = ?, duration = ? WHERE id = ?`)
      .run(
        updated.name,
        updated.path,
        updated.type,
        updated.duration ?? null,
        id,
      );

    return updated;
  },

  deleteAsset(id: string): void {
    const database = getDb();

    const affectedPlaylists = database
      .prepare(`SELECT DISTINCT playlist_id FROM playlist_items WHERE asset_id = ?`)
      .all(id) as { playlist_id: string }[];

    const result = database.prepare(`DELETE FROM assets WHERE id = ?`).run(id);
    if (result.changes === 0) throw notFound("Asset");

    for (const { playlist_id } of affectedPlaylists) {
      const items = loadPlaylistItems(database, playlist_id);
      reindexItems(database, playlist_id, items);
    }
  },

  listPlaylists(channelId?: string): Playlist[] {
    const database = getDb();
    const rows = channelId
      ? (database
          .prepare(`SELECT * FROM playlists WHERE channel_id = ? ORDER BY created_at DESC`)
          .all(channelId) as PlaylistRow[])
      : (database
          .prepare(`SELECT * FROM playlists ORDER BY created_at DESC`)
          .all() as PlaylistRow[]);

    return rows.map((row) => rowToPlaylist(database, row));
  },

  getPlaylist(id: string): Playlist {
    const row = getDb().prepare(`SELECT * FROM playlists WHERE id = ?`).get(id) as
      | PlaylistRow
      | undefined;
    if (!row) throw notFound("Playlist");
    return rowToPlaylist(getDb(), row);
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

    getDb()
      .prepare(
        `INSERT INTO playlists (id, channel_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(playlist.id, playlist.channelId, playlist.name, playlist.createdAt, playlist.updatedAt);

    return playlist;
  },

  updatePlaylist(id: string, data: UpdatePlaylist): Playlist {
    const database = getDb();
    const playlist = this.getPlaylist(id);
    const updated: Playlist = {
      ...playlist,
      ...data,
      id: playlist.id,
      channelId: playlist.channelId,
      createdAt: playlist.createdAt,
      updatedAt: now(),
    };

    database
      .prepare(`UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?`)
      .run(updated.name, updated.updatedAt, id);

    if (data.items) {
      database.prepare(`DELETE FROM playlist_items WHERE playlist_id = ?`).run(id);
      const insert = database.prepare(
        `INSERT INTO playlist_items (playlist_id, asset_id, sort_order) VALUES (?, ?, ?)`,
      );
      for (const item of data.items) {
        insert.run(id, item.assetId, item.order);
      }
    }

    return this.getPlaylist(id);
  },

  deletePlaylist(id: string): void {
    const result = getDb().prepare(`DELETE FROM playlists WHERE id = ?`).run(id);
    if (result.changes === 0) throw notFound("Playlist");
  },

  addPlaylistItem(playlistId: string, data: AddPlaylistItem): Playlist {
    const database = getDb();
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

    database
      .prepare(
        `INSERT INTO playlist_items (playlist_id, asset_id, sort_order) VALUES (?, ?, ?)`,
      )
      .run(playlistId, data.assetId, order);

    database
      .prepare(`UPDATE playlists SET updated_at = ? WHERE id = ?`)
      .run(now(), playlistId);

    return this.getPlaylist(playlistId);
  },

  removePlaylistItem(playlistId: string, assetId: string): Playlist {
    const database = getDb();
    const playlist = this.getPlaylist(playlistId);
    const items = playlist.items.filter((item) => item.assetId !== assetId);

    if (items.length === playlist.items.length) {
      throw notFound("Playlist item");
    }

    database
      .prepare(`DELETE FROM playlist_items WHERE playlist_id = ? AND asset_id = ?`)
      .run(playlistId, assetId);

    reindexItems(database, playlistId, items);

    database
      .prepare(`UPDATE playlists SET updated_at = ? WHERE id = ?`)
      .run(now(), playlistId);

    return this.getPlaylist(playlistId);
  },
};
