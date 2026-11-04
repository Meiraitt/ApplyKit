import PgBoss from "pg-boss";
import { env } from "../../config/config.js";
import type { DB } from "../database/db.js";

export const queueName = "generate-cv";

export const boss = new PgBoss({
  connectionString: env.databaseUrl,
  application_name: "applykit-queue",
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInMinutes: 30,
  retentionDays: 30,
});
boss.on("error", (e) => console.error("Queue:", e.message));

export async function startQueue() {
  await boss.start();
  await boss.createQueue(queueName);
}

export async function enqueue(db: DB, generationId: string) {
  await boss.send(
    queueName,
    { generationId },
    {
      id: generationId,
      db: { executeSql: (sql, values) => db.query(sql, values) },
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInMinutes: 30,
    },
  );
}
