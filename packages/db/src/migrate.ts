import { createDbClient } from "./index.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(): Promise<void> {
  const db = createDbClient();
  await migrate(db, {
    migrationsFolder: "./drizzle"
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log("db migrations complete");
    })
    .catch((error) => {
      console.error("db migrations failed", error);
      process.exit(1);
    });
}
