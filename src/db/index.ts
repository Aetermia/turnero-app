import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Scripts run outside Next (migrations, seeds) do not get the framework's
// automatic .env loading. `loadEnvFile` is a Node built-in, so this needs no
// dependency. The guard keeps it a no-op when Next already loaded the file.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env is optional: in CI or production the variable comes from the host.
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in the local Postgres credentials.",
  );
}

// In development Next reloads modules on every edit. Without this cache each
// reload would open a new connection pool and eventually exhaust Postgres.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.pgClient ?? postgres(connectionString, { max: 10 });
globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
