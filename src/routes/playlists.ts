import type { FastifyInstance } from "fastify";
import { parsePlaylistInput, parsePlaylistName, parseUuidParam } from "../security/parse.js";
import { store } from "../store.js";
import type { AddPlaylistItem, CreatePlaylist, UpdatePlaylist } from "../types.js";

export async function playlistRoutes(app: FastifyInstance): Promise<void> {
  app.get("/playlists", async () => store.listPlaylists());

  app.get<{ Params: { id: string } }>("/playlists/:id", async (request) => {
    parseUuidParam(request.params.id);
    return store.getPlaylist(request.params.id);
  });

  app.post<{ Body: CreatePlaylist }>("/playlists", async (request, reply) => {
    const playlist = store.createPlaylist(parsePlaylistInput(request.body));
    reply.code(201);
    return playlist;
  });

  app.put<{ Params: { id: string }; Body: UpdatePlaylist }>(
    "/playlists/:id",
    async (request) => {
      parseUuidParam(request.params.id);
      const update: UpdatePlaylist = {};

      if (request.body.name !== undefined) {
        update.name = parsePlaylistName(request.body.name);
      }

      return store.updatePlaylist(request.params.id, update);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/playlists/:id",
    async (request, reply) => {
      parseUuidParam(request.params.id);
      store.deletePlaylist(request.params.id);
      reply.code(204);
    },
  );

  app.post<{ Params: { id: string }; Body: AddPlaylistItem }>(
    "/playlists/:id/items",
    async (request) => {
      parseUuidParam(request.params.id);
      parseUuidParam(request.body.assetId, "assetId");
      return store.addPlaylistItem(request.params.id, request.body);
    },
  );

  app.delete<{ Params: { id: string; assetId: string } }>(
    "/playlists/:id/items/:assetId",
    async (request) => {
      parseUuidParam(request.params.id);
      parseUuidParam(request.params.assetId, "assetId");
      return store.removePlaylistItem(request.params.id, request.params.assetId);
    },
  );
}
