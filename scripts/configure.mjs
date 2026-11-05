import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    return undefined;
  }
}

export async function configure(root) {
  const target = resolve(root, ".env");
  const legacy = resolve(root, "config/.env");
  const [current, previous] = await Promise.all([
    readOptional(target),
    readOptional(legacy),
  ]);

  if (current && previous && !current.equals(previous)) {
    throw new Error(
      "Both .env and config/.env exist with different contents. Reconcile them into the root .env, then remove config/.env. Neither file was changed.",
    );
  }

  if (previous) {
    if (!current) await copyFile(legacy, target, constants.COPYFILE_EXCL);
    await unlink(legacy);
  } else if (!current) {
    const template = await readFile(resolve(root, ".env.example"), "utf8");

    await writeFile(
      target,
      template.replaceAll("CHANGE_ME", randomBytes(24).toString("hex")),
      { flag: "wx", mode: 0o600 },
    );
  }

  await mkdir(resolve(root, "data"), { recursive: true });

  try {
    await copyFile(
      resolve(root, "config/profile.example.json"),
      resolve(root, "data/profile.json"),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await configure(resolve(fileURLToPath(new URL("..", import.meta.url))));
    console.log(
      "Root .env and data/profile.json ready. Existing values preserved.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
