import { pool, type DB } from "../infrastructure/database/db.js";

export async function dashboard(weeks = 8, now = new Date(), db: DB = pool) {
  const weekly = (
    await db.query(
      `WITH bounds AS (
 SELECT date_trunc('week',$1::timestamptz AT TIME ZONE 'America/Sao_Paulo') AS current_week
 ), weeks AS (SELECT generate_series(current_week-($2::int-1)*interval '1 week',current_week,interval '1 week') AS week FROM bounds),
 saved AS (SELECT date_trunc('week',saved_at AT TIME ZONE 'America/Sao_Paulo') AS week,count(*)::int AS n FROM vacancies WHERE NOT archived GROUP BY 1),
 applied AS (SELECT date_trunc('week',applied_at AT TIME ZONE 'America/Sao_Paulo') AS week,count(*)::int AS n FROM vacancies WHERE NOT archived AND applied_at IS NOT NULL GROUP BY 1)
 SELECT to_char(w.week,'YYYY-MM-DD') AS week,coalesce(s.n,0)::int AS saved,coalesce(a.n,0)::int AS applied FROM weeks w LEFT JOIN saved s USING(week) LEFT JOIN applied a USING(week) ORDER BY w.week`,
      [now, weeks],
    )
  ).rows;
  const totals = (
    await db.query(`SELECT count(*)::int AS saved,count(applied_at)::int AS applied,
 count(*) FILTER(WHERE applied_at IS NULL)::int AS pending,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM generations g WHERE g.vacancy_id=v.id AND g.state='ready'))::int AS ready
 FROM vacancies v WHERE NOT archived`)
  ).rows[0];

  return { timezone: "America/Sao_Paulo", weekly, totals };
}
