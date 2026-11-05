import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { codexArgs } from "/app/backend/dist/infrastructure/providers/codex-client.js";

const exec = promisify(execFile);

// Parse the actual adapter arguments without sending a generation request.
await exec("codex", [
  ...codexArgs("/tmp/schema.json", "/tmp/result.json"),
  "--help",
]);

const { stdout: features } = await exec("codex", ["features", "list"]);
const args = codexArgs("/tmp/schema.json", "/tmp/result.json");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--disable")
    assert.ok(
      features.includes(args[i + 1]),
      `Unknown Codex feature: ${args[i + 1]}`,
    );
}

const { stdout: help } = await exec("claude", ["--help"]);

for (const flag of [
  "--safe-mode",
  "--tools",
  "--json-schema",
  "--strict-mcp-config",
  "--setting-sources",
  "--permission-mode",
  "--disable-slash-commands",
  "--no-session-persistence",
]) {
  assert.ok(help.includes(flag), `Claude does not support ${flag}`);
}

console.log(
  "Pinned CLI binaries support the adapter interface. No inference or authentication was simulated.",
);
