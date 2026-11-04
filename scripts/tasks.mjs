import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { ensureNode24 } from "./runtime.mjs";
import { rm } from "node:fs/promises";

await ensureNode24();
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function run(script, args = [], cwd = root) {
  await new Promise((ok, fail) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0
        ? ok()
        : fail(new Error(`Command exited with code ${code}: ${script}`)),
    );
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const task = process.argv[2];

    if (!["build", "test", "check"].includes(task))
      throw new Error("Use build, check or test.");

    if (task === "test")
      await (await import("./test-database.mjs")).prepareTestDatabase();

    if (task === "build") {
      // Fixed build output only; never touch data, source or configured artifact paths.
      const output = resolve(root, "backend", "dist");

      if (
        !output.startsWith(
          resolve(root, "backend") +
            (process.platform === "win32" ? "\\" : "/"),
        )
      )
        throw new Error("Unexpected build directory.");
      await rm(output, { recursive: true, force: true });
    }

    for (const part of ["backend", "frontend"]) {
      const cwd = resolve(root, part);

      if (task === "test")
        await run("node_modules/vitest/vitest.mjs", ["run"], cwd);
      else
        await run(
          "node_modules/typescript/bin/tsc",
          task === "check" || part === "frontend"
            ? ["--noEmit"]
            : ["-p", "tsconfig.json"],
          cwd,
        );
    }

    if (task === "build")
      await run(
        "node_modules/vite/bin/vite.js",
        ["build"],
        resolve(root, "frontend"),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
