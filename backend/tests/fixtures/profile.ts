import { readFile } from "node:fs/promises";
import { profileSchema } from "../../src/domain/types.js";

export async function loadProfile() {
  return profileSchema.parse(
    JSON.parse(
      await readFile(new URL("./profile-v36.json", import.meta.url), "utf8"),
    ),
  );
}
