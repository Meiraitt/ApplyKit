import { run } from "./tasks.mjs";

try {
  await run("backend/node_modules/tsx/dist/cli.mjs", ["backend/src/doctor.ts"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
