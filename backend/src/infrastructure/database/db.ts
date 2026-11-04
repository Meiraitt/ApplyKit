import pg from "pg";
import { env } from "../../config/config.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 8 });

export type DB = Pick<pg.PoolClient, "query">;

export async function transaction<T>(
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();

  try {
    await db.query("BEGIN");
    const value = await fn(db);

    await db.query("COMMIT");

    return value;
  } catch (e) {
    await db.query("ROLLBACK");

    throw e;
  } finally {
    db.release();
  }
}

export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(20261021)");
    await db.query(`
 CREATE TABLE IF NOT EXISTS vacancies (
 id uuid PRIMARY KEY, title text NOT NULL, company text NOT NULL DEFAULT '', url text,
 canonical_key text UNIQUE, description text NOT NULL DEFAULT '', source text NOT NULL,
 language text NOT NULL DEFAULT 'pt-BR' CHECK(language IN ('pt-BR','en')),
 saved_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz NOT NULL DEFAULT now(),
 applied_at timestamptz, applied_generation_id uuid,
 archived boolean NOT NULL DEFAULT false, extraction_error text);
 CREATE TABLE IF NOT EXISTS generations (
 id uuid PRIMARY KEY, vacancy_id uuid NOT NULL REFERENCES vacancies(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','importing','generating','reviewing','ready','needs_input','needs_review','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 profile_snapshot jsonb, vacancy_snapshot jsonb, cv jsonb, review jsonb,
 model text, prompt_version text NOT NULL DEFAULT '2026-10-v2', error text,
 duration_ms integer, pdf_path text, docx_path text, telegram_chat text);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_generation ON generations(vacancy_id)
 WHERE state IN ('queued','importing','generating','reviewing');
 CREATE INDEX IF NOT EXISTS generations_vacancy ON generations(vacancy_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS telegram_updates (update_id bigint PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS app_state (key text PRIMARY KEY,value text NOT NULL);
 CREATE TABLE IF NOT EXISTS telegram_outbox (
 id bigserial PRIMARY KEY, dedup_key text UNIQUE NOT NULL, chat_id text NOT NULL,
 text text NOT NULL, generation_id uuid, sent_at timestamptz,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), error text);
 ALTER TABLE generations ADD COLUMN IF NOT EXISTS token_usage jsonb;
 ALTER TABLE generations ADD COLUMN IF NOT EXISTS draft jsonb;
 ALTER TABLE generations ADD COLUMN IF NOT EXISTS tailoring jsonb;
 ALTER TABLE generations ADD COLUMN IF NOT EXISTS repair_of uuid REFERENCES generations(id);
 ALTER TABLE telegram_outbox ADD COLUMN IF NOT EXISTS reply_markup jsonb;
 `);
  });
}
