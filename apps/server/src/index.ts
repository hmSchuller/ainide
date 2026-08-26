import { createServer } from "./server.js";

const server = await createServer();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "127.0.0.1";

await server.app.listen({ port: Number.isFinite(port) ? port : 3000, host });

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
