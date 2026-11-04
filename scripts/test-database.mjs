import pg from "../backend/node_modules/pg/lib/index.js";
import { config } from "../backend/node_modules/dotenv/lib/main.js";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../config/.env", import.meta.url)) });

export async function prepareTestDatabase() {
  if (!process.env.DATABASE_URL)
    throw Error("Set DATABASE_URL before integration tests.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    if (
      !(
        await client.query(
          "SELECT 1 FROM pg_database WHERE datname='applykit_test'",
        )
      ).rowCount
    ) {
      await client.query("CREATE DATABASE applykit_test");
    }
  } finally {
    await client.end();
  }
}
