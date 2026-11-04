import type { DB } from "../../infrastructure/database/db.js";
import { outbox, resolveVacancyId } from "../../services/jobs.service.js";

export const menu = {
  keyboard: [
    [{ text: "New job" }, { text: "My jobs" }],
    [{ text: "Help" }, { text: "Cancel" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Choose an option or send a description",
};
const inline = (rows: { text: string; callback_data: string }[][]) => ({
  inline_keyboard: rows,
});
const button = (text: string, callback_data: string) => ({
  text,
  callback_data,
});

export const jobButtons = (id: string, applied = false) =>
  inline([
    [
      button("Generate CV", `generate:${id}`),
      button("Download PDF and DOCX", `download:${id}`),
    ],
    [
      button(
        applied ? "Change application date" : "Mark as applied",
        `data:${id}`,
      ),
    ],
    ...(applied ? [[button("Undo application", `unapplied:${id}`)]] : []),
    [
      button("Edit description", `description:${id}`),
      button("Refresh", `status:${id}`),
    ],
    [button("Back to jobs", "list:0")],
  ]);
type Session = {
  kind: "job" | "description" | "data";
  id?: string;
  expires: number;
};

export async function interactive(
  db: DB,
  chat: string,
  updateId: number,
  raw: string,
  callback?: string,
): Promise<string | undefined> {
  const key = `conversation:${chat}`;
  const send = (text: string, markup: unknown = menu) =>
    outbox(db, `reply:${updateId}`, chat, text, undefined, markup);
  const clear = () => db.query("DELETE FROM app_state WHERE key=$1", [key]);
  const ask = async (kind: Session["kind"], text: string, id?: string) => {
    await db.query(
      "INSERT INTO app_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, JSON.stringify({ kind, id, expires: Date.now() + 86400000 })],
    );

    await send(text + "\nUse Cancel to exit.", {
      force_reply: true,
      input_field_placeholder:
        kind === "data" ? "YYYY-MM-DD or today" : "Paste content here",
    });
  };

  if (callback) {
    const [action, id] = callback.split(":");

    if (action === "list") raw = `/jobs ${id}`;
    else if (["status", "generate", "download", "unapplied"].includes(action))
      raw = `/${action} ${id}`;
    else if (["description", "data"].includes(action)) {
      const resolved = await resolveVacancyId(id, db);

      await ask(
        action as "description" | "data",
        action === "data"
          ? "When did you apply? Enter YYYY-MM-DD or today."
          : "Paste the full job description (at least 80 characters).",
        resolved,
      );

      return;
    } else {
      await send("This button is unavailable. Open My jobs.");

      return;
    }
  }

  if (raw === "Cancel" || raw === "/cancel") {
    await clear();
    await send("Input cancelled. Choose an option.");

    return;
  }

  if (raw === "New job" || raw === "/job") {
    await ask(
      "job",
      "Send the public URL or full job description. You can also send the link and text together.",
    );

    return;
  }

  if (raw === "Help") raw = "/help";

  if (raw === "My jobs") raw = "/jobs";

  if (/^\/jobs(?:\s|$)/.test(raw)) {
    await clear();
    const page = Math.min(
      100000,
      Math.max(0, Number(raw.split(/\s+/)[1]) || 0),
    );
    const rows = (
      await db.query(
        "SELECT id,title,applied_at FROM vacancies WHERE NOT archived ORDER BY saved_at DESC,id DESC LIMIT 7 OFFSET $1",
        [Math.floor(page) * 6],
      )
    ).rows;
    const keys = rows
      .slice(0, 6)
      .map((v) => [
        button(
          `${v.applied_at ? "✓ " : ""}${v.title.slice(0, 48)}`,
          `status:${v.id}`,
        ),
      ]);
    const navigation = [];

    if (page > 0) navigation.push(button("← Previous", `list:${page - 1}`));

    if (rows.length > 6) navigation.push(button("Next →", `list:${page + 1}`));

    if (navigation.length) keys.push(navigation);
    await send(
      rows.length
        ? `My jobs · page ${page + 1}\nChoose a job to see its CV and application.`
        : "No jobs on this page. Use New job to add one.",
      keys.length ? inline(keys) : menu,
    );

    return;
  }

  if (raw.startsWith("/")) {
    await clear();

    return raw;
  }

  const record = (
    await db.query("SELECT value FROM app_state WHERE key=$1", [key])
  ).rows[0];

  if (record) {
    const session = JSON.parse(record.value) as Session;

    if (session.expires < Date.now()) {
      await clear();
      await send("Input expired. Choose New job or open a job to start again.");

      return;
    }

    // The caller's transaction rolls this deletion back when validation fails.
    await clear();

    if (session.kind === "job") return `/job ${raw}`;

    if (session.kind === "description")
      return `/description ${session.id} ${raw}`;

    return `/applied ${session.id}${raw.toLowerCase() === "today" ? "" : ` ${raw}`}`;
  }

  await send(
    "Choose New job to send a link or description, or My jobs to browse and generate CVs.",
  );
}
