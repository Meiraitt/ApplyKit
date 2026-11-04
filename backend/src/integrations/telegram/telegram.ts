import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../../config/config.js";
import {
  pool,
  transaction,
  type DB,
} from "../../infrastructure/database/db.js";
import { approvedDownload } from "../../repositories/downloads.repository.js";
import {
  createSubmission,
  outbox,
  requestGeneration,
  resolveVacancyId,
} from "../../services/jobs.service.js";
import { interactive, jobButtons, menu } from "./telegram-ui.js";

export type Update = {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number } };
  };
  message?: { date?: number; chat: { id: number }; text?: string };
};

export async function telegramCall(method: string, body: unknown) {
  if (!env.telegramToken) throw new Error("Telegram not configured.");
  const response = await fetch(
    `https://api.telegram.org/bot${env.telegramToken}/${method}`,
    {
      method: "POST",
      headers:
        body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    },
  );

  if (!response.ok)
    throw new Error(`Telegram returned HTTP ${response.status}.`);
  const result = (await response.json()) as { ok: boolean; result: any };

  if (!result.ok) throw new Error("Telegram rejected the operation.");

  return result.result;
}

export async function receiveUpdate(update: Update) {
  await transaction(async (db) => {
    const accepted = await db.query(
      "INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id",
      [update.update_id],
    );

    if (
      accepted.rowCount &&
      ((String(update.message?.chat.id) === env.telegramChat &&
        update.message?.text) ||
        (String(update.callback_query?.message?.chat.id) === env.telegramChat &&
          String(update.callback_query?.from.id) === env.telegramChat &&
          update.callback_query?.data))
    ) {
      // User mistakes are reported; unexpected database errors roll back intake and acknowledgement.
      await db.query("SAVEPOINT command");

      try {
        await handleCommand(db, update);
      } catch (e) {
        await db.query("ROLLBACK TO SAVEPOINT command");

        if ((e as { code?: string }).code) throw e;
        await outbox(
          db,
          `reply:${update.update_id}`,
          env.telegramChat!,
          `Could not complete: ${e instanceof Error ? e.message : "check the command."}\nRetry or use Cancel.`,
          undefined,
          menu,
        );
      }
    }

    await db.query(
      "INSERT INTO app_state(key,value) VALUES('telegram_offset',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [String(update.update_id + 1)],
    );
  });
}

async function handleCommand(db: DB, update: Update) {
  const message = update.message ?? { chat: { id: Number(env.telegramChat) } };
  const chat = String(message.chat.id);
  const raw = await interactive(
    db,
    chat,
    update.update_id,
    message.text?.trim() ?? "",
    update.callback_query?.data,
  );

  if (!raw) return;
  const match = raw.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);

  if (!match) return;
  const command = match[1].toLowerCase(),
    argument = match[2]?.trim() ?? "";
  let markup: unknown = menu;
  const reply = (text: string, generationId?: string) =>
    outbox(db, `reply:${update.update_id}`, chat, text, generationId, markup);

  if (command === "start" || command === "help")
    return reply(
      "Use New job to enter a job or My jobs to open actions. If the menu is collapsed, tap the keyboard icon next to the message.\n\nCommands:\n/job URL or /job followed by the full description\n/jobs — recent jobs\n/status ID — progress\n/description ID TEXT — complete description\n/generate ID — new version\n/download ID — PDF and DOCX\n/applied ID [YYYY-MM-DD] — mark application\n/unapplied ID — undo\nWhen your computer is off, Telegram retains pending updates for up to 24 hours.",
    );

  if (command === "job") {
    if (!argument)
      throw new Error("Send /job URL or /job followed by the description.");
    const url = argument.match(/^https?:\/\/\S+/i)?.[0];
    const description = url ? argument.slice(url.length).trim() : argument;
    const result = await createSubmission(
      { title: "", company: "", url, description, language: "pt-BR" },
      {
        db,
        chatId: chat,
        receivedAt: message.date ? new Date(message.date * 1000) : new Date(),
      },
    );

    markup = jobButtons(result.vacancy.id, !!result.vacancy.applied_at);

    return reply(
      `${result.duplicate ? "This job is already saved." : "Job saved and queued."}\nID: ${result.vacancy.id.slice(0, 8)}\n${result.duplicate ? "Use /status or /generate with this ID." : "You can send other jobs while processing continues."}`,
    );
  }

  if (command === "jobs") {
    const rows = (
      await db.query(
        `SELECT v.id,v.title,v.applied_at,(SELECT state FROM generations WHERE vacancy_id=v.id ORDER BY created_at DESC LIMIT 1) AS state FROM vacancies v ORDER BY saved_at DESC LIMIT 10`,
      )
    ).rows;

    return reply(
      rows.length
        ? rows
            .map(
              (v) =>
                `${v.id.slice(0, 8)} | ${v.title}\n${stateLabel(v.state)} · ${v.applied_at ? "Applied" : "Not applied"}`,
            )
            .join("\n\n")
        : "No saved jobs yet.",
    );
  }

  if (
    ![
      "status",
      "description",
      "generate",
      "download",
      "applied",
      "unapplied",
    ].includes(command)
  )
    return reply("Unknown command. Use /help.");
  const [prefix, ...rest] = argument.split(/\s+/);
  const id = await resolveVacancyId(prefix ?? "", db);
  const vacancy = (await db.query("SELECT * FROM vacancies WHERE id=$1", [id]))
    .rows[0];

  markup = jobButtons(id, !!vacancy.applied_at);
  const generation = (
    await db.query(
      "SELECT * FROM generations WHERE vacancy_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [id],
    )
  ).rows[0];

  if (command === "status")
    return reply(
      `${vacancy.title}\n${stateLabel(generation?.state)}\n${generation?.error ?? ""}\nSaved on ${new Date(vacancy.saved_at).toLocaleDateString("pt-BR")}\n${vacancy.applied_at ? "Applied on " + new Date(vacancy.applied_at).toLocaleDateString("pt-BR") : "Not applied yet."}`,
    );

  if (command === "description") {
    const description = rest.join(" ");

    if (description.length < 80)
      throw new Error("Paste the full description (at least 80 characters).");

    if (description.length > 40000)
      throw new Error("Description too long. Use the dashboard.");
    await db.query("SELECT id FROM vacancies WHERE id=$1 FOR UPDATE", [id]);

    if (
      (
        await db.query(
          "SELECT id FROM generations WHERE vacancy_id=$1 AND state IN ('queued','importing','generating','reviewing')",
          [id],
        )
      ).rowCount
    )
      throw new Error("Wait for current processing to finish.");
    await db.query(
      "UPDATE vacancies SET description=$2,extraction_error=NULL,title=CASE WHEN title='Imported job' THEN $3 ELSE title END WHERE id=$1",
      [id, description, description.slice(0, 120)],
    );

    await requestGeneration(id, chat, db);

    return reply("Description saved. Generation queued.");
  }

  if (command === "generate") {
    await requestGeneration(id, chat, db);

    return reply("Generation queued. You will be notified when it finishes.");
  }

  const approved = (
    await db.query(
      "SELECT id FROM generations WHERE vacancy_id=$1 AND state='ready' ORDER BY created_at DESC LIMIT 1",
      [id],
    )
  ).rows[0];

  if (command === "download") {
    if (!approved) throw new Error("No approved CV for this job yet.");

    return reply(`CV for ${vacancy.title}`, approved.id);
  }

  if (command === "unapplied") {
    await db.query(
      "UPDATE vacancies SET applied_at=NULL,applied_generation_id=NULL WHERE id=$1",
      [id],
    );

    markup = jobButtons(id, false);

    return reply("Application removed.");
  }

  const date = rest[0];

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Use YYYY-MM-DD for dates.");
  const applied = date ? new Date(`${date}T00:00:00-03:00`) : new Date();

  if (
    !Number.isFinite(applied.getTime()) ||
    (date && applied.toISOString().slice(0, 10) !== date) ||
    applied.getTime() > Date.now() + 60000
  )
    throw new Error("Enter a valid date that is not in the future.");
  await db.query(
    "UPDATE vacancies SET applied_at=$2,applied_generation_id=$3 WHERE id=$1",
    [id, applied, approved?.id ?? null],
  );

  markup = jobButtons(id, true);

  return reply(`Application recorded for ${vacancy.title}.`);
}

export function stateLabel(state: string) {
  return (
    (
      {
        queued: "Queued",
        importing: "Reading description",
        generating: "Writing CV",
        reviewing: "Reviewing CV",
        ready: "CV ready",
        needs_input: "Awaiting description",
        needs_review: "Needs review",
        failed: "Failed",
      } as Record<string, string>
    )[state] ?? "Not generated"
  );
}

export async function deliverOutbox() {
  const rows = (
    await pool.query(
      "SELECT * FROM telegram_outbox WHERE sent_at IS NULL AND next_attempt_at<=now() ORDER BY id LIMIT 10",
    )
  ).rows;

  for (const item of rows) {
    try {
      const textKey = `text:${item.id}`;

      if (
        !(await pool.query("SELECT key FROM app_state WHERE key=$1", [textKey]))
          .rowCount
      ) {
        await telegramCall("sendMessage", {
          chat_id: item.chat_id,
          text: item.text.slice(0, 4000),
          disable_web_page_preview: true,
          reply_markup: item.reply_markup ?? menu,
        });

        await pool.query(
          "INSERT INTO app_state(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [textKey, "sent"],
        );
      }

      if (item.generation_id) {
        for (const format of ["pdf", "docx"] as const) {
          const key = `file:${item.id}:${format}`;

          if (
            (await pool.query("SELECT key FROM app_state WHERE key=$1", [key]))
              .rowCount
          )
            continue;
          const download = await approvedDownload(item.generation_id, format);

          if (!download) throw new Error("CV unavailable.");
          const bytes = await readFile(resolve(env.artifactDir, download.file));
          const form = new FormData();

          form.set("chat_id", item.chat_id);
          form.set("document", new Blob([bytes]), download.filename);
          await telegramCall("sendDocument", form);
          await pool.query(
            "INSERT INTO app_state(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [key, "sent"],
          );
        }
      }

      await pool.query(
        "UPDATE telegram_outbox SET sent_at=now(),error=NULL WHERE id=$1",
        [item.id],
      );
    } catch {
      await pool.query(
        "UPDATE telegram_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '30 seconds',error='Telegram delivery failed; retry scheduled.' WHERE id=$1",
        [item.id],
      );
    }
  }
}
