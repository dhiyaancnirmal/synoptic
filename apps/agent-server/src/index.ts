import { createServer } from "./server.js";
import { loadEnv } from "./env.js";

const env = loadEnv();

async function start(): Promise<void> {
  const app = await createServer();

  await app.listen({ host: "0.0.0.0", port: env.port });
  app.log.info({ port: env.port }, "agent-server started");

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void start();
