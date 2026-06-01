import type { FastifyInstance } from "fastify";
import { loadEngineConfig, probeDuration } from "../engine/index.js";
import { parseAssetInput, parseAssetUpdate, parseUuidParam } from "../security/parse.js";
import { store } from "../store.js";
import type { CreateAsset, UpdateAsset } from "../types.js";

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/assets", async () => store.listAssets());

  app.get<{ Params: { id: string } }>("/assets/:id", async (request) => {
    parseUuidParam(request.params.id);
    return store.getAsset(request.params.id);
  });

  app.post<{ Body: CreateAsset }>("/assets", async (request, reply) => {
    const body = parseAssetInput(request.body);

    if (body.duration === undefined && loadEngineConfig().mode === "ffmpeg") {
      const probed = await probeDuration(body.path);
      if (probed !== null) {
        body.duration = probed;
      }
    }

    const asset = store.createAsset(body);
    reply.code(201);
    return asset;
  });

  app.put<{ Params: { id: string }; Body: UpdateAsset }>(
    "/assets/:id",
    async (request) => {
      parseUuidParam(request.params.id);
      return store.updateAsset(request.params.id, parseAssetUpdate(request.body));
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/assets/:id",
    async (request, reply) => {
      parseUuidParam(request.params.id);
      store.deleteAsset(request.params.id);
      reply.code(204);
    },
  );
}
