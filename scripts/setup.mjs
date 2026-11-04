import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  constants,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./tasks.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Use Node.js 24 or later.");

  if (!process.env.npm_execpath) throw new Error("Run npm run setup.");

  for (const part of ["backend", "frontend"])
    await run(process.env.npm_execpath, ["ci"], resolve(root, part));
  await mkdir(resolve(root, "data"), { recursive: true });
  const password = randomBytes(24).toString("hex");
  const template = (
    await readFile(resolve(root, "config/.env.example"), "utf8")
  )
    .replaceAll("CHANGE_ME", password)
    .replaceAll("ALTERE_ESTA_SENHA", password);

  try {
    await writeFile(resolve(root, "config/.env"), template, { flag: "wx" });
    console.log("config/.env created with a random local password.");
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    console.log("Existing config/.env preserved.");
  }

  try {
    await copyFile(
      resolve(root, "config/profile.example.json"),
      resolve(root, "data/profile.json"),
      constants.COPYFILE_EXCL,
    );
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }

  console.log(
    "Edit data/profile.json and select CV_PROVIDER in config/.env. Then run npm run doctor and npm run dev.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
