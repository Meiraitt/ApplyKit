import { createApp } from "./app.js";
import { env } from "./config/config.js";
import { migrate, pool } from "./infrastructure/database/db.js";
import { boss, startQueue } from "./infrastructure/queue/queue.js";

await migrate();
await startQueue();
const server = createApp().listen(env.port, env.host, () =>
  console.log(`ApplyKit: http://127.0.0.1:${env.port}`),
);

server.on("error", () => {
  console.error("Could not start API: port unavailable.");
  process.exit(1);
});

async function stop() {
  server.close(async () => {
    await boss.stop();
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
