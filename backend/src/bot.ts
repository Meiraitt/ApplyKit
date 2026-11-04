import { env } from "./config/config.js";
import { migrate, pool } from "./infrastructure/database/db.js";
import { boss, startQueue } from "./infrastructure/queue/queue.js";
import {
  deliverOutbox,
  receiveUpdate,
  telegramCall,
  type Update,
} from "./integrations/telegram/telegram.js";

if (!env.telegramToken || !env.telegramChat)
  throw new Error(
    "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to restrict access to your chat.",
  );
await migrate();
await startQueue();
// Exclusive session lock prevents two polling processes from consuming the same bot.
const lock = await pool.connect();
const result = await lock.query(
  "SELECT pg_try_advisory_lock(741903) AS acquired",
);

if (!result.rows[0].acquired)
  throw new Error("Another bot process is already running.");
const webhook = await telegramCall("getWebhookInfo", {});

if (webhook.url)
  throw new Error(
    "This bot has a webhook. Explicitly remove it before using local polling.",
  );
console.log(
  "Telegram ready. Commands are persisted before acknowledging receipt.",
);

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

while (!stopping) {
  try {
    await deliverOutbox();
    const saved = (
      await pool.query(
        "SELECT value FROM app_state WHERE key='telegram_offset'",
      )
    ).rows[0];
    const updates = (await telegramCall("getUpdates", {
      offset: saved ? Number(saved.value) : undefined,
      timeout: 5,
      limit: 100,
      allowed_updates: ["message", "callback_query"],
    })) as Update[];

    for (const update of updates) {
      await receiveUpdate(update);

      if (update.callback_query)
        await telegramCall("answerCallbackQuery", {
          callback_query_id: update.callback_query.id,
        }).catch(() => {});
    }
  } catch {
    console.error("Temporary Telegram failure. Retrying in 5 seconds.");

    await new Promise((r) => setTimeout(r, 5000));
  }
}

await lock.query("SELECT pg_advisory_unlock(741903)");
lock.release();
await boss.stop();
await pool.end();
