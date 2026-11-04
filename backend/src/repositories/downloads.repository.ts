import { pool, type DB } from "../infrastructure/database/db.js";

// A download label, never a storage path. Snapshots keep old versions stable
// when the candidate edits the live profile or vacancy later.
export function cvFilename(
  name: string,
  position: string,
  company: string,
  version: number,
  format: "pdf" | "docx",
) {
  const part = (value: string, fallback: string, limit: number) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, limit)
      .replace(/_+$/g, "") || fallback;
  const role = position
    .replace(/full[\s-]*stack/gi, "Fullstack")
    .replace(/front[\s-]*end/gi, "Frontend")
    .replace(/back[\s-]*end/gi, "Backend");
  const base = [
    part(name, "Candidate", 65),
    part(role, "Job", 75),
    part(company, "Company", 55),
  ].join("_");

  return `${base}${version > 1 ? `_v${version}` : ""}.${format}`;
}

export async function approvedDownload(
  id: string,
  format: "pdf" | "docx",
  db: DB = pool,
) {
  const g = (
    await db.query(
      `SELECT g.*,
    (SELECT count(*)::int FROM generations previous
      WHERE previous.vacancy_id=g.vacancy_id
      AND (previous.created_at,previous.id)<=(g.created_at,g.id)) AS version
    FROM generations g WHERE g.id=$1 AND g.state='ready'`,
      [id],
    )
  ).rows[0];

  if (!g || g[`${format}_path`] !== `${id}.${format}`) return undefined;

  return {
    file: `${id}.${format}`,
    filename: cvFilename(
      g.cv?.name ?? g.profile_snapshot?.name ?? "",
      g.vacancy_snapshot?.title ?? g.cv?.headline ?? "",
      g.vacancy_snapshot?.company ?? "",
      g.version,
      format,
    ),
  };
}
