import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { config } from "../backend/node_modules/dotenv/lib/main.js";
import pg from "../backend/node_modules/pg/lib/index.js";
import { ensureNode24 } from "./runtime.mjs";

await ensureNode24();

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

config({ path: resolve(root, ".env") });
const args = new Set(process.argv.slice(2));
const node = existsSync(resolve(root, "runtime/node.exe"))
  ? resolve(root, "runtime/node.exe")
  : process.execPath;
const pgctl = resolve(root, "runtime/pgsql/bin/pg_ctl.exe");
const pgdata = resolve(root, "data/postgres");
const tsx = resolve(root, "backend/node_modules/tsx/dist/cli.mjs");
const vite = resolve(root, "frontend/node_modules/vite/bin/vite.js");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://applykit@127.0.0.1:54329/applykit";
const apiPort = Number(process.env.BACKEND_PORT ?? 3333);
const apiUrl = "http://127.0.0.1:" + apiPort;
const webUrl = "http://127.0.0.1:5173";
const ollamaUrl = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const exec = promisify(execFile);
const children = [];
let ownDatabase = false,
  stopping = false,
  cleanupPromise,
  startingDatabase,
  heartbeat;
const log = (name, message) => console.log("[" + name + "] " + message);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const secrets = [
  databaseUrl,
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.GEMINI_API_KEY_WRITER,
  process.env.GEMINI_API_KEY_REVIEWER,
  process.env.LLM_API_KEY,
  process.env.LLM_API_KEY_WRITER,
  process.env.LLM_API_KEY_REVIEWER,
].filter(Boolean);

function clean(text) {
  for (const secret of secrets) text = text.split(secret).join("[redacted]");

  return text.replace(
    /(secretKey|password|token)(\s*:\s*)[^,\n]+/gi,
    "$1$2[redacted]",
  );
}

async function command(file, args) {
  return exec(file, args, {
    cwd: root,
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

function launch(name, file, args, cwd = root, keep = false) {
  if (stopping) throw Error("Startup cancelled.");
  const child = spawn(file, args, {
    cwd,
    windowsHide: true,
    detached: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: resolve(root, "runtime") + delimiter + process.env.PATH,
    },
  });
  const item = { name, child, keep, closed: false };

  children.push(item);

  for (const stream of [child.stdout, child.stderr])
    createInterface({ input: stream }).on("line", (line) =>
      log(name, clean(line)),
    );
  child.once("error", (error) => {
    log(name, error.message);
    void shutdown(1);
  });

  child.once("exit", (code, signal) => {
    item.closed = true;

    if (!stopping) {
      log(name, "Exited (" + (signal ?? code) + ").");
      void shutdown(1);
    }
  });

  return child;
}

async function json(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });

    if (r.ok) return await r.json();
  } catch {}

  return null;
}

async function ready(test, label, seconds = 30) {
  const end = Date.now() + seconds * 1000;

  while (Date.now() < end && !stopping) {
    if (await test()) return;
    await pause(500);
  }

  throw Error(
    stopping
      ? "Startup cancelled."
      : label + " did not respond. Check the logs above.",
  );
}

async function connect() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 1500,
  });

  client.on("error", () => {});

  try {
    await client.connect();

    return client;
  } catch {
    await client.end().catch(() => {});

    return null;
  }
}

async function databaseReady() {
  const c = await connect();

  if (!c) return false;

  try {
    await c.query("SELECT 1");

    return true;
  } finally {
    await c.end();
  }
}

async function lockHeld(id) {
  const c = await connect();

  if (!c) throw Error("Database unavailable.");

  try {
    const r = await c.query("SELECT pg_try_advisory_lock($1) AS acquired", [
      id,
    ]);

    return !r.rows[0].acquired;
  } finally {
    await c.end();
  }
}

async function portOpen(port) {
  const net = await import("node:net");

  return new Promise((r) => {
    const s = net.createConnection({ host: "127.0.0.1", port });

    s.setTimeout(800);
    s.once("connect", () => {
      s.destroy();
      r(true);
    });

    s.once("error", () => r(false));
    s.once("timeout", () => {
      s.destroy();
      r(false);
    });
  });
}

async function terminate(item) {
  if (item.closed || item.keep || !item.child.pid) return;

  if (process.platform === "win32")
    await command("taskkill.exe", [
      "/PID",
      String(item.child.pid),
      "/T",
      "/F",
    ]).catch(() => {});
  else item.child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (cleanupPromise) return cleanupPromise;
  stopping = true;
  cleanupPromise = (async () => {
    log("dev", "Stopping processes started by this command...");

    if (startingDatabase) await startingDatabase.catch(() => {});
    await Promise.all(children.map(terminate));

    if (ownDatabase) {
      try {
        await command(pgctl, ["stop", "-D", pgdata, "-m", "fast", "-w"]);
        log("postgres", "Stopped.");
      } catch {
        log("postgres", "Could not stop; check with pg_ctl status.");
      }
    }

    log(
      "dev",
      "Previously active services were preserved. Ollama remains available to other applications.",
    );

    clearInterval(heartbeat);

    for (const item of children.filter((x) => x.keep)) {
      item.child.stdout.destroy();
      item.child.stderr.destroy();
      item.child.unref();
    }

    process.exitCode = code;
  })();

  return cleanupPromise;
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

async function main() {
  if (args.has("--help")) {
    console.log(
      "npm run dev                 Database + API (tsx watch) + Vite + worker + provider\nnpm run dev -- --web-only    Database + API + Vite\nnpm run dev -- --check       Check dependencies without starting services\nCtrl+C stops only processes started here (Ollama is shared).",
    );

    return;
  }

  for (const file of [node, tsx, vite, resolve(root, ".env")])
    if (!existsSync(file))
      throw Error("Missing dependency. Run npm run setup: " + file);

  if (Number(process.versions.node.split(".")[0]) < 24)
    throw Error("Use Node.js 24 or later.");

  if (apiPort !== 3333)
    throw Error(
      "The frontend proxy uses port 3333. Set BACKEND_PORT to 3333 before starting.",
    );

  if (args.has("--check")) {
    log("dev", "Local dependencies found. No services started.");

    return;
  }

  if (!(await databaseReady())) {
    const db = new URL(databaseUrl);

    if (
      !["127.0.0.1", "localhost"].includes(db.hostname) ||
      db.port !== "54329"
    )
      throw Error(
        "Configured database unavailable. Automatic startup supports local PostgreSQL on port 54329.",
      );

    if (!existsSync(pgctl) || !existsSync(resolve(pgdata, "PG_VERSION"))) {
      log("postgres", "Starting PostgreSQL with Docker Compose...");

      try {
        await exec(
          "docker",
          ["compose", "--env-file", ".env", "up", "-d", "postgres"],
          {
            cwd: root,
            windowsHide: true,
            timeout: 180000,
            maxBuffer: 1024 * 1024,
          },
        );
      } catch {
        throw Error(
          "Could not start the database. Start Docker or set DATABASE_URL to a running PostgreSQL instance.",
        );
      }

      await ready(databaseReady, "PostgreSQL", 60);
    } else {
      let running = false;

      try {
        await command(pgctl, ["status", "-D", pgdata]);
        running = true;
      } catch {}

      if (running)
        throw Error(
          "PostgreSQL is running, but connection failed. Check .env.",
        );
      log("postgres", "Starting local database...");
      // pg_ctl runs detached on Windows so terminal Ctrl+C is handled by this supervisor.
      startingDatabase = new Promise((resolveStart, reject) => {
        const child = spawn(
          pgctl,
          [
            "start",
            "-D",
            pgdata,
            "-l",
            resolve(root, "data/postgres.log"),
            "-w",
          ],
          {
            cwd: root,
            windowsHide: true,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let error = "";

        child.stdout.on("data", (b) => log("postgres", String(b).trim()));
        child.stderr.on("data", (b) => {
          error += b;
          log("postgres", String(b).trim());
        });

        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) {
            ownDatabase = true;
            resolveStart();
          } else reject(Error("PostgreSQL did not start. " + error.trim()));
        });
      });

      await startingDatabase;
      await ready(databaseReady, "PostgreSQL");
    }
  } else log("postgres", "Reusing running database.");

  if (
    !args.has("--web-only") &&
    (process.env.CV_PROVIDER ?? "codex") === "ollama"
  ) {
    if (!(await json(ollamaUrl + "/api/tags"))) {
      const target = new URL(ollamaUrl);

      if (!["127.0.0.1", "localhost"].includes(target.hostname))
        throw Error("Configured Ollama did not respond.");
      const portableOllama = resolve(
        process.env.LOCALAPPDATA ?? "",
        "Programs/Ollama/ollama.exe",
      );
      const ollama = existsSync(portableOllama) ? portableOllama : "ollama";

      launch("ollama", ollama, ["serve"], root, true);
      await ready(
        async () => Boolean(await json(ollamaUrl + "/api/tags")),
        "Ollama",
      );
    } else log("ollama", "Reusing running service.");
  }

  const existing = await json(apiUrl + "/api/health");

  if (existing?.ok)
    log("api", "Reusing running API with its current execution mode.");
  else {
    if (await portOpen(apiPort))
      throw Error("API port is occupied by another process.");
    launch(
      "api",
      node,
      [tsx, "watch", "src/server.ts"],
      resolve(root, "backend"),
    );
  }

  if (await portOpen(5173)) {
    const html = await fetch(webUrl, {
      signal: AbortSignal.timeout(2000),
    }).then((r) => r.text());

    if (!html.includes("<title>ApplyKit ") || !html.includes("/@vite/client"))
      throw Error("Port 5173 is occupied by another process.");
    log("front", "Reusing running Vite.");
  } else
    launch(
      "front",
      node,
      [vite, "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
      resolve(root, "frontend"),
    );
  await ready(
    async () => Boolean((await json(apiUrl + "/api/health"))?.ok),
    "API",
  );

  await ready(() => portOpen(5173), "Frontend");

  if (!args.has("--web-only")) {
    if (await lockHeld(741904)) log("worker", "Reusing running worker.");
    else
      launch("worker", node, [tsx, "src/worker.ts"], resolve(root, "backend"));

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      if (await lockHeld(741903)) log("bot", "Reusing running bot.");
      else launch("bot", node, [tsx, "src/bot.ts"], resolve(root, "backend"));
    }
  }

  log("dev", "Ready. Frontend: " + webUrl + " | API: " + apiUrl);
  log(
    "dev",
    "Frontend/backend changes reload automatically. Press Ctrl+C to stop.",
  );

  // Keep the supervisor responsive even when it reused all services.
  if (args.has("--smoke")) {
    await pause(1000);
    await shutdown();

    return;
  }

  heartbeat = setInterval(() => {}, 60000);
}

main().catch((error) => {
  log("error", clean(error.message));
  void shutdown(1);
});
