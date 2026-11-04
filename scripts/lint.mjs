import { run } from "./tasks.mjs";

const fix = process.argv.includes("--fix");

// Normalize line wrapping first so padding rules see the final statement shape.
if (fix) await run("scripts/format.mjs", ["--write"]);

await run("node_modules/eslint/bin/eslint.js", [
  ".",
  ...(fix ? ["--fix"] : []),
]);

await run("scripts/format.mjs", [fix ? "--write" : "--check"]);
