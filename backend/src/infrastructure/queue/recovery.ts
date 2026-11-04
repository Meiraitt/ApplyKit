import { pool, transaction } from "../database/db.js";
import { boss, queueName } from "./queue.js";

// Caller holds the exclusive worker advisory lock. No live worker owns these jobs.
export async function recoverInterruptedJobs() {
  const interrupted = (
    await pool.query(
      "SELECT id FROM pgboss.job WHERE name=$1 AND state='active'",
      [queueName],
    )
  ).rows;

  for (const job of interrupted) {
    await transaction(async (db) => {
      await boss.fail(
        queueName,
        job.id,
        { message: "Worker interrupted; resuming processing." },
        { db: { executeSql: (sql, values) => db.query(sql, values) } },
      );

      const queued = (
        await db.query("SELECT state FROM pgboss.job WHERE id=$1", [job.id])
      ).rows[0];

      await db.query(
        "UPDATE generations SET state=$2,error=$3,updated_at=now() WHERE id=$1 AND state IN ('queued','importing','generating','reviewing')",
        [
          job.id,
          queued?.state === "failed" ? "failed" : "queued",
          "Processing interrupted. " +
            (queued?.state === "failed"
              ? "Use Generate new version."
              : "Retry queued."),
        ],
      );
    });
  }

  return interrupted.length;
}
