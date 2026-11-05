import { pool } from "../database/db.js";

try {
  const lockId = process.argv[2] === "telegram" ? 741903 : 741904;
  const { rows } = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=$1 AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS ready",
    [lockId],
  );

  if (!rows[0].ready) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await pool.end();
}
