import { resolveBackendPort } from "@ainide/shared";
import { createServer } from "./server.js";
import { listen } from "./listen.js";
import { resolveStartupUpdate } from "./update-check.js";

const update = await resolveStartupUpdate();
const server = await createServer({
  update: {
    current: update.current,
    ...(update.latest ? { latest: update.latest } : {}),
    ...(update.notesUrl ? { notesUrl: update.notesUrl } : {}),
  },
});
if (update.notice) console.log(update.notice);

const port = resolveBackendPort(process.env.PORT);
const host = process.env.HOST || "127.0.0.1";

await listen(server.app, host, port);
console.log(`ainide is running at http://${host}:${port}/?token=${server.token}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("SIGHUP", shutdown);
