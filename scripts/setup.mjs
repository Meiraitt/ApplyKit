import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./tasks.mjs";
import { configure } from "./configure.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Use Node.js 24 or later.");

  if (!process.env.npm_execpath) throw new Error("Run npm run setup.");
  await configure(root);

  for (const part of ["backend", "frontend"])
    await run(process.env.npm_execpath, ["ci"], resolve(root, part));
  console.log(
    "Edit data/profile.json and select CV_PROVIDER in the root .env. Then run npm run doctor and npm start.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
