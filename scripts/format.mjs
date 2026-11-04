import { run } from "./tasks.mjs";

const mode = process.argv.includes("--write") ? "--write" : "--check";

try {
  await run("node_modules/prettier/bin/prettier.cjs", [".", mode]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
