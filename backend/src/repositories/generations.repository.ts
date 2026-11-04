import { pool, type DB } from "../infrastructure/database/db.js";

export function findGeneration(values: unknown[], db: DB = pool) {
  return db.query("SELECT * FROM generations WHERE id=$1", values);
}

export function findVacancy(values: unknown[], db: DB = pool) {
  return db.query("SELECT * FROM vacancies WHERE id=$1", values);
}

export function saveUsage(values: unknown[], db: DB = pool) {
  return db.query("UPDATE generations SET token_usage=$2 WHERE id=$1", values);
}

export function setStage(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET state=$2,error=NULL,updated_at=now() WHERE id=$1",
    values,
  );
}

export function saveImportedVacancy(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE vacancies SET title=$2,company=$3,description=$4,extraction_error=NULL WHERE id=$1",
    values,
  );
}

export function saveSnapshot(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET profile_snapshot=$2,vacancy_snapshot=$3,model=$4,prompt_version=$5 WHERE id=$1",
    values,
  );
}

export function saveCheckpoint(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET draft=$2,tailoring=$3,review=$4,updated_at=now() WHERE id=$1",
    values,
  );
}

export function saveSelection(values: unknown[], db: DB = pool) {
  return db.query("UPDATE generations SET tailoring=$2 WHERE id=$1", values);
}

export function saveReviewedCandidate(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET cv=$2,review=$3,updated_at=now() WHERE id=$1",
    values,
  );
}

export function saveFinalSelection(values: unknown[], db: DB = pool) {
  return db.query("UPDATE generations SET tailoring=$2 WHERE id=$1", values);
}

export function completeGeneration(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET state=$2,cv=$3,review=$4,pdf_path=$5,docx_path=$6,duration_ms=$7,draft=$8,error=NULL,updated_at=now() WHERE id=$1",
    values,
  );
}

export function markNeedsInput(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE generations SET state='needs_input',error=$2,updated_at=now() WHERE id=$1",
    values,
  );
}

export function saveExtractionError(values: unknown[], db: DB = pool) {
  return db.query(
    "UPDATE vacancies SET extraction_error=$2 WHERE id=$1",
    values,
  );
}
