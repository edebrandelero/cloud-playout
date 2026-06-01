import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PORT) || 3000;

const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
  if (_req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "cloud-playout" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`cloud-playout listening on http://localhost:${PORT}`);
});
