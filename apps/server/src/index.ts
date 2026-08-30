import { createServer } from "./server.js";
import { resolveBackendPort } from "@ainide/shared";

const server = await createServer();
const port = resolveBackendPort(process.env.PORT);
const host = process.env.HOST || "127.0.0.1";

await server.app.listen({ port, host });

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
