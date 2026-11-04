import { readFile } from "node:fs/promises";
import { env } from "../config/config.js";
import { profileSchema } from "../domain/types.js";

export async function loadProfile() {
  const profile = profileSchema.parse(
    JSON.parse(await readFile(env.profilePath, "utf8")),
  );

  if (/EXAMPLE PROFILE|PERFIL DE EXEMPLO/i.test(profile.notes))
    throw new Error(
      "Replace the example profile in data/profile.json with your confirmed facts before generating a CV.",
    );

  return profile;
}
