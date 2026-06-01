import fp from "fastify-plugin";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const panelRoot = join(process.cwd(), "public", "panel");

async function staticPlugin(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => reply.redirect("/panel/"));

  app.get("/panel", async (_request, reply) => reply.redirect("/panel/"));

  await app.register(fastifyStatic, {
    root: panelRoot,
    prefix: "/panel/",
    decorateReply: false,
  });
}

export default fp(staticPlugin, { name: "static-panel" });
