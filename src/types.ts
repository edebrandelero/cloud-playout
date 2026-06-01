export type AssetType = "video" | "audio";

export interface Channel {
  id: string;
  name: string;
  description?: string;
  outputUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  name: string;
  path: string;
  type: AssetType;
  duration?: number;
  createdAt: string;
}

export interface PlaylistItem {
  assetId: string;
  order: number;
}

export interface Playlist {
  id: string;
  channelId: string;
  name: string;
  items: PlaylistItem[];
  createdAt: string;
  updatedAt: string;
}

export type CreateChannel = Pick<Channel, "name"> &
  Partial<Pick<Channel, "description" | "outputUrl">>;

export type UpdateChannel = Partial<CreateChannel>;

export type CreateAsset = Pick<Asset, "name" | "path" | "type"> &
  Partial<Pick<Asset, "duration">>;

export type UpdateAsset = Partial<CreateAsset>;

export type CreatePlaylist = Pick<Playlist, "channelId" | "name">;

export type UpdatePlaylist = Partial<Pick<Playlist, "name" | "items">>;

export type AddPlaylistItem = Pick<PlaylistItem, "assetId"> &
  Partial<Pick<PlaylistItem, "order">>;
