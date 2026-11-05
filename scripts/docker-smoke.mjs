import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("..", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "applykit-docker-test-"));
const project = `applykit-test-${randomBytes(5).toString("hex")}`;
const server = createServer();

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;

await new Promise((ok) => server.close(ok));
const base = `http://127.0.0.1:${port}`;
const composeArgs = [
  "compose",
  "--project-name",
  project,
  "--env-file",
  join(temp, ".env"),
  "-f",
  resolve(root, "compose.yaml"),
  "-f",
  join(temp, "override.yaml"),
];

function compose(...args) {
  return new Promise((ok, fail) => {
    const child = spawn("docker", [...composeArgs, ...args], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, COMPOSE_PROFILES: "" },
    });

    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`Compose ${args[0]} exited ${code}`)),
    );
  });
}

async function api(path, method = "GET", body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();

  assert.ok(response.ok, JSON.stringify(data));

  return data;
}

try {
  await copyFile(
    resolve(root, "config/profile.example.json"),
    join(temp, "profile.json"),
  );

  await writeFile(
    join(temp, ".env"),
    `POSTGRES_PASSWORD=test-only-${randomBytes(12).toString("hex")}\nBACKEND_PORT=${port}\nCV_PROVIDER=codex\n`,
  );

  const profile = JSON.stringify(
    join(temp, "profile.json").replaceAll("\\", "/"),
  );

  await writeFile(
    join(temp, "override.yaml"),
    `services:\n  postgres:\n    ports: !override ["127.0.0.1::5432"]\n` +
      ["app", "worker", "telegram"]
        .map(
          (service) =>
            `  ${service}:\n    volumes:\n      - type: bind\n        source: ${profile}\n        target: /app/data/profile.json\n        read_only: true\n`,
        )
        .join(""),
  );

  await compose("build", "app");
  await compose("up", "-d", "--wait", "--wait-timeout", "180", "app");
  assert.deepEqual(await api("/health"), { ok: true });
  const html = await (await fetch(base)).text();

  assert.match(html, /<div id="root">/);
  const asset = html.match(/src="([^"]+\.js)"/)[1];

  assert.equal((await fetch(base + asset)).status, 200);
  const denied = await fetch(`${base}/api/jobs`, {
    headers: { Origin: "https://untrusted.example" },
  });

  assert.equal(denied.status, 403);
  const input = {
    title: "Container test",
    company: "Fictional Test Company",
    language: "en",
    description:
      "A fictional frontend position building React and TypeScript interfaces and integrating forms with existing REST APIs. This record exists only for the container integration test.",
  };
  const created = await api("/jobs", "POST", input);
  const id = created.vacancy.id;

  assert.equal((await api("/jobs", "POST", input)).duplicate, true);
  assert.equal((await api(`/jobs/${id}`)).generations[0].state, "queued");
  await compose("down");
  await compose("up", "-d", "--wait", "--wait-timeout", "180");
  let generation;

  for (let i = 0; i < 60; i++) {
    generation = (await api(`/jobs/${id}`)).generations[0];

    if (generation.state === "failed") break;
    await delay(1000);
  }

  assert.equal(generation.state, "failed");
  assert.match(generation.error, /example profile/i);
  await api(`/jobs/${id}`, "PATCH", {
    ...input,
    title: "Edited container test",
  });

  await api(`/jobs/${id}/application`, "PATCH", {
    appliedAt: new Date().toISOString(),
  });

  assert.ok((await api(`/jobs/${id}`)).applied_at);
  await api("/dashboard");
  await api(`/jobs/${id}/application`, "PATCH", { appliedAt: null });
  await compose(
    "cp",
    resolve(root, "scripts/docker-render-smoke.mjs"),
    "worker:/tmp/docker-render-smoke.mjs",
  );

  await compose("exec", "-T", "worker", "node", "/tmp/docker-render-smoke.mjs");
  await compose(
    "cp",
    resolve(root, "scripts/docker-cli-smoke.mjs"),
    "worker:/tmp/docker-cli-smoke.mjs",
  );

  await compose("exec", "-T", "worker", "node", "/tmp/docker-cli-smoke.mjs");
  await compose(
    "exec",
    "-T",
    "app",
    "node",
    "--input-type=module",
    "-e",
    "import {access} from 'node:fs/promises'; await access('/app/data/cvs/container-smoke.pdf'); await access('/app/data/cvs/container-smoke.docx');",
  );

  await compose("restart", "app", "worker");
  await compose("up", "-d", "--wait", "--wait-timeout", "180");
  await compose(
    "exec",
    "-T",
    "worker",
    "node",
    "--input-type=module",
    "-e",
    "import {access} from 'node:fs/promises'; await access('/app/data/cvs/container-smoke.pdf');",
  );

  assert.equal((await api(`/jobs/${id}`, "DELETE")).deleted, true);
  assert.equal((await api("/jobs")).length, 0);
  console.log(
    "Docker smoke passed: frontend, API, PostgreSQL, queue/restart, validation failure, edits, application status, deletion and persistent PDF/DOCX. No AI approval was simulated.",
  );
} finally {
  await compose("down", "--volumes", "--remove-orphans");
  await rm(temp, { recursive: true, force: true });
}
