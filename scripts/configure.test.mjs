import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configure } from "./configure.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "applykit-config-test-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "config"));
  await writeFile(
    join(root, ".env.example"),
    "POSTGRES_PASSWORD=CHANGE_ME\nDATABASE_URL=postgresql://applykit:CHANGE_ME@localhost/db\n",
  );

  await writeFile(
    join(root, "config/profile.example.json"),
    '{"fictional":true}',
  );

  return root;
}

test("creates matching credentials once and preserves edited configuration/profile", async (t) => {
  const root = await fixture(t);

  await configure(root);
  const env = await readFile(join(root, ".env"), "utf8");
  const password = env.match(/POSTGRES_PASSWORD=([a-f0-9]{48})/)[1];

  assert.ok(env.includes(`:${password}@`));
  await writeFile(join(root, "data/profile.json"), '{"personal":true}');
  await configure(root);
  assert.equal(await readFile(join(root, ".env"), "utf8"), env);
  assert.equal(
    await readFile(join(root, "data/profile.json"), "utf8"),
    '{"personal":true}',
  );
});

test("migrates legacy configuration byte for byte without changing values", async (t) => {
  const root = await fixture(t);
  const value =
    '# existing installation\r\nKEY="test-only value $ with # characters"\r\n';

  await writeFile(join(root, "config/.env"), value);
  await configure(root);
  assert.equal(await readFile(join(root, ".env"), "utf8"), value);
  await assert.rejects(access(join(root, "config/.env")));
});

test("conflicting root and legacy files are left untouched", async (t) => {
  const root = await fixture(t);

  await writeFile(join(root, ".env"), "KEY=current");
  await writeFile(join(root, "config/.env"), "KEY=previous");
  await assert.rejects(configure(root), /Neither file was changed/);
  assert.equal(await readFile(join(root, ".env"), "utf8"), "KEY=current");
  assert.equal(
    await readFile(join(root, "config/.env"), "utf8"),
    "KEY=previous",
  );
});

test("removes an identical legacy copy safely", async (t) => {
  const root = await fixture(t);

  await writeFile(join(root, ".env"), "KEY=same");
  await writeFile(join(root, "config/.env"), "KEY=same");
  await configure(root);
  assert.equal(await readFile(join(root, ".env"), "utf8"), "KEY=same");
  await assert.rejects(access(join(root, "config/.env")));
});
