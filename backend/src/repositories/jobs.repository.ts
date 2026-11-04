import { pool, type DB } from "../infrastructure/database/db.js";

export function insertVacancy(values: unknown[] = [], db: DB = pool) {
  return db.query(
    `INSERT INTO vacancies(id,title,company,url,canonical_key,description,source,language,received_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(canonical_key) DO NOTHING RETURNING *`,
    values,
  );
}

export function findByCanonicalKey(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT * FROM vacancies WHERE canonical_key=$1", values);
}

export function lockVacancy(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT * FROM vacancies WHERE id=$1 FOR UPDATE", values);
}

export function findActiveGeneration(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "SELECT id FROM generations WHERE vacancy_id=$1 AND state IN ('queued','importing','generating','reviewing')",
    values,
  );
}

export function setGenerationChat(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "UPDATE generations SET telegram_chat=$2 WHERE id=$1",
    values,
  );
}

export function insertGeneration(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "INSERT INTO generations(id,vacancy_id,telegram_chat,prompt_version) VALUES($1,$2,$3,$4)",
    values,
  );
}

export function listVacancies(values: unknown[] = [], db: DB = pool) {
  return db.query(
    `SELECT v.*,g.id AS generation_id,g.state AS generation_state,g.error AS generation_error,
 (SELECT count(*)::integer FROM generations WHERE vacancy_id=v.id) AS version_count
 FROM vacancies v LEFT JOIN LATERAL (SELECT * FROM generations WHERE vacancy_id=v.id ORDER BY created_at DESC,id DESC LIMIT 1) g ON true
 ORDER BY v.saved_at DESC`,
    values,
  );
}

export function lockRepairVacancy(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT * FROM vacancies WHERE id=$1 FOR UPDATE", values);
}

export function findRepairBase(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "SELECT * FROM generations WHERE id=$1 AND vacancy_id=$2",
    values,
  );
}

export function findActiveRepair(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "SELECT id,repair_of FROM generations WHERE vacancy_id=$1 AND state IN ('queued','importing','generating','reviewing')",
    values,
  );
}

export function insertRepair(values: unknown[] = [], db: DB = pool) {
  return db.query(
    `INSERT INTO generations(id,vacancy_id,prompt_version,repair_of,profile_snapshot,vacancy_snapshot,draft,review,tailoring)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    values,
  );
}

export function lockDeletedVacancy(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT id FROM vacancies WHERE id=$1 FOR UPDATE", values);
}

export function listGenerationStates(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "SELECT id,state FROM generations WHERE vacancy_id=$1",
    values,
  );
}

export function findActiveQueueJobs(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "SELECT id FROM pgboss.job WHERE name=$1 AND id=ANY($2::uuid[]) AND state='active'",
    values,
  );
}

export function deleteOutbox(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "DELETE FROM telegram_outbox WHERE generation_id=ANY($1::uuid[])",
    values,
  );
}

export function deleteQueuedJobs(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "DELETE FROM pgboss.job WHERE name=$1 AND id=ANY($2::uuid[])",
    values,
  );
}

export function deleteGenerations(values: unknown[] = [], db: DB = pool) {
  return db.query("DELETE FROM generations WHERE vacancy_id=$1", values);
}

export function deleteVacancyRow(values: unknown[] = [], db: DB = pool) {
  return db.query("DELETE FROM vacancies WHERE id=$1", values);
}

export function findVacancy(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT * FROM vacancies WHERE id=$1", values);
}

export function listGenerationDetails(values: unknown[] = [], db: DB = pool) {
  return db.query(
    `SELECT id,vacancy_id,state,created_at,updated_at,cv,review,error,model,prompt_version,duration_ms,repair_of,token_usage,
 (state='needs_review' AND draft IS NOT NULL AND review IS NOT NULL AND profile_snapshot IS NOT NULL AND vacancy_snapshot IS NOT NULL AND tailoring IS NOT NULL AND jsonb_array_length(COALESCE(review->'issues','[]'::jsonb))>0) AS can_repair,
 (pdf_path IS NOT NULL AND docx_path IS NOT NULL AND state='ready') AS downloadable FROM generations WHERE vacancy_id=$1 ORDER BY created_at DESC,id DESC`,
    values,
  );
}

export function insertOutbox(values: unknown[] = [], db: DB = pool) {
  return db.query(
    "INSERT INTO telegram_outbox(dedup_key,chat_id,text,generation_id,reply_markup) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedup_key) DO NOTHING",
    values,
  );
}

export function findVacancyIds(values: unknown[] = [], db: DB = pool) {
  return db.query("SELECT id FROM vacancies WHERE id::text LIKE $1", values);
}

export function lockEditedVacancy(values: unknown[], db: DB = pool) {
  return db.query("SELECT id FROM vacancies WHERE id=$1 FOR UPDATE", values);
}

export function findEditingGeneration(values: unknown[], db: DB = pool) {
  return db.query(
    "SELECT id FROM generations WHERE vacancy_id=$1 AND state IN ('queued','importing','generating','reviewing')",
    values,
  );
}

export function updateVacancy(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE vacancies SET title=$2,company=$3,description=$4,language=$5,extraction_error=NULL WHERE id=$1",
    values,
  );
}

export function findApprovedGeneration(values: unknown[], db: DB = pool) {
  return db.query(
    "SELECT id FROM generations WHERE id=$1 AND vacancy_id=$2 AND state='ready'",
    values,
  );
}

export function updateApplication(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE vacancies SET applied_at=$2,applied_generation_id=$3 WHERE id=$1 RETURNING id",
    values,
  );
}
