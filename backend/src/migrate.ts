import { migrate, pool } from "./infrastructure/database/db.js";

await migrate();
await pool.end();
console.log("Banco pronto.");
