import type { FastifyInstance } from "fastify";
import { scheduler } from "../scheduler/index.js";
import { parseChannelInput, parseChannelUpdate, parseUuidParam } from "../security/parse.js";
import { store } from "../store.js";
import type { CreateChannel, UpdateChannel } from "../types.js";

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/channels", async () => store.listChannels());

  app.get<{ Params: { id: string } }>("/channels/:id", async (request) => {
    parseUuidParam(request.params.id);
    return store.getChannel(request.params.id);
  });

  app.post<{ Body: CreateChannel }>("/channels", async (request, reply) => {
    const channel = store.createChannel(parseChannelInput(request.body));
    reply.code(201);
    return channel;
  });

  app.put<{ Params: { id: string }; Body: UpdateChannel }>(
    "/channels/:id",
    async (request) => {
      parseUuidParam(request.params.id);
      return store.updateChannel(request.params.id, parseChannelUpdate(request.body));
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/channels/:id",
    async (request, reply) => {
      parseUuidParam(request.params.id);
      scheduler.removeChannel(request.params.id);
      store.deleteChannel(request.params.id);
      reply.code(204);
    },
  );

  app.get<{ Params: { channelId: string } }>(
    "/channels/:channelId/playlists",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return store.listPlaylists(request.params.channelId);
    },
  );
}
