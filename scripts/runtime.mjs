import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, delimiter } from "node:path";

export async function ensureNode24() {
  if (Number(process.versions.node.split(".")[0]) >= 24) return;
  const runtime = resolve(
    fileURLToPath(new URL("../runtime", import.meta.url)),
  );
  const node = resolve(runtime, "node.exe");

  if (!existsSync(node)) throw Error("Install Node.js 24 or later.");
  const code = await new Promise((ok, fail) => {
    const child = spawn(node, process.argv.slice(1), {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        PATH: runtime + delimiter + (process.env.PATH ?? ""),
      },
    });

    child.once("error", fail);
    child.once("exit", (code) => ok(code ?? 1));
  });

  process.exit(code);
}
