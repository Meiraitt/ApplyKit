import { env } from "./config/config.js";
import { migrate, pool, transaction } from "./infrastructure/database/db.js";
import { CodexError } from "./infrastructure/providers/codex-client.js";
import { GeminiError } from "./infrastructure/providers/gemini-client.js";
import { boss, queueName, startQueue } from "./infrastructure/queue/queue.js";
import { recoverInterruptedJobs } from "./infrastructure/queue/recovery.js";
import { processGeneration } from "./services/generation.service.js";
import { outbox } from "./services/jobs.service.js";

await migrate();
await startQueue();
const lock = await pool.connect();

if (
  !(await lock.query("SELECT pg_try_advisory_lock(741904) AS acquired")).rows[0]
    .acquired
)
  throw new Error("A worker is already active.");
lock.on("error", () => process.exit(1));
console.log(
  `Tarefas interrompidas recuperadas: ${await recoverInterruptedJobs()}`,
);

// Separate queue consumers keep each CV's completion/retry independent. Local
// inference remains serial; Codex can process a bounded user-selected batch.
const concurrency = ["codex", "claude"].includes(env.cvProvider)
  ? env.cvConcurrency
  : 1;

for (let slot = 0; slot < concurrency; slot++)
  await boss.work<{ generationId: string }>(
    queueName,
    { batchSize: 1, includeMetadata: true, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await processGeneration(job.data.generationId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Processing failed.";
          const noRetry =
            error instanceof GeminiError ||
            error instanceof CodexError ||
            ["gemini", "codex", "claude", "compatible"].includes(
              env.cvProvider,
            );
          const terminal = noRetry || job.retryCount >= job.retryLimit;

          await transaction(async (db) => {
            const result = await db.query(
              "UPDATE generations SET state=$2,error=$3,updated_at=now() WHERE id=$1 RETURNING telegram_chat",
              [job.data.generationId, terminal ? "failed" : "queued", message],
            );

            if (terminal && result.rows[0]?.telegram_chat)
              await outbox(
                db,
                `failed:${job.id}`,
                result.rows[0].telegram_chat,
                "Generation failed after retries. Check the dashboard error, resolve its cause and retry in the dashboard or with /generate ID.",
              );
          });

          if (noRetry) continue; // Preserve quotas: only an explicit new request may retry Gemini.

          throw error;
        }
      }
    },
  );
console.log(
  `Worker ready. Generation and review provider: ${env.cvProvider}. Concurrency: ${concurrency}. Waiting for queued CVs.`,
);

let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  await boss.stop({ graceful: true, timeout: 10000 });
  lock.release();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
