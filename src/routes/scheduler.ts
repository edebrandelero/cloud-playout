import type { FastifyInstance } from "fastify";
import { parseUuidParam } from "../security/parse.js";
import { scheduler } from "../scheduler/index.js";
import type { StartPlayout } from "../scheduler/types.js";

export async function schedulerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { channelId: string } }>(
    "/channels/:channelId/playout",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return scheduler.getStatus(request.params.channelId);
    },
  );

  app.post<{ Params: { channelId: string }; Body: StartPlayout }>(
    "/channels/:channelId/playout/start",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      parseUuidParam(request.body.playlistId, "playlistId");
      return scheduler.start(request.params.channelId, request.body.playlistId);
    },
  );

  app.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/playout/pause",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return scheduler.pause(request.params.channelId);
    },
  );

  app.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/playout/resume",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return scheduler.resume(request.params.channelId);
    },
  );

  app.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/playout/stop",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return scheduler.stop(request.params.channelId);
    },
  );

  app.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/playout/skip",
    async (request) => {
      parseUuidParam(request.params.channelId, "channelId");
      return scheduler.skip(request.params.channelId);
    },
  );
}
